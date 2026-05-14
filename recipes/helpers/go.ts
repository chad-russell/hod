//! Go build profile + goBuild driver.
//!
//! Provides the standard environment for Go builds and the `goBuild`
//! convenience helper that wraps shell-driven builds with Go-specific setup.
//!
//! Usage (profile only):
//!   import { goProfile } from "../helpers/go.js";
//!   shellBuild({ ...goProfile(), deps: [...], script: `...` });
//!
//! Usage (goBuild):
//!   import { goBuild } from "../helpers/go.js";
//!   const recipe = await goBuild({ name: "hello", toolchain: tc, goToolchain: go, ... });

import {
  hermeticPreamble,
  HOD_DUMMY_RPATH_FLAG,
  dep,
  depPath,
  depSubpath,
  shellBuild,
} from "../../js/src/index.js";
import type { ProcessDependency } from "../../js/src/dep.js";
import type { BuiltRecipe } from "../../js/src/file.js";
import type { EnvEntry } from "../../js/src/process.js";

export interface GoProfileOptions {
  /** Dep name for the C toolchain bundle (default: "toolchain"). */
  tc?: string;
  /** Dep name for the Go toolchain (default: "go"). */
  go?: string;
  /** Enable CGO (default: false). */
  cgo?: boolean;
}

/**
 * Return environment defaults for a Go build.
 *
 * Returns shell, preamble, and process-level env vars.  Use with shellBuild:
 *
 *   shellBuild({ ...goProfile(), deps: [...], script: `...` });
 *
 * When `cgo` is false (default), the environment is simpler — no CC,
 * no dummy RPATH, no hermetic preamble. When `cgo` is true, the full
 * C toolchain environment is activated so that cgo can compile and link
 * against glibc.
 */
export function goProfile(opts: GoProfileOptions = {}): {
  shell: string;
  preamble: string;
  env: Record<string, string>;
} {
  const tc = opts.tc ?? "toolchain";
  const goDep = opts.go ?? "go";
  const cgo = opts.cgo ?? false;

  const baseEnv: Record<string, string> = {
    PATH: `${depSubpath(goDep, "bin")}:${depSubpath(tc, "bin")}`,
    GOROOT: depPath(goDep),
    GOCACHE: "/tmp/.go-cache",
    GOPATH: "/tmp/.go-path",
    CGO_ENABLED: cgo ? "1" : "0",
  };

  // Always include the hermetic preamble: the toolchain's bin/ directory
  // contains real GNU coreutils binaries (mkdir, cp, cat, etc.) that are
  // dynamically linked against glibc. They need /lib/ld-linux-x86-64.so.2
  // even when CGO is disabled.
  const preamble = hermeticPreamble({ shell: tc, glibcLinker: tc });

  if (cgo) {
    return {
      shell: depSubpath(tc, "bin/busybox"),
      preamble,
      env: {
        ...baseEnv,
        CC: `${depSubpath(tc, "bin/gcc")} --sysroot=${depSubpath(tc, "sysroot")} -B${depSubpath(tc, "bin")}`,
        HOD_DUMMY_RPATH: HOD_DUMMY_RPATH_FLAG,
        CGO_LDFLAGS: HOD_DUMMY_RPATH_FLAG,
      },
    };
  }

  return {
    shell: depSubpath(tc, "bin/busybox"),
    preamble,
    env: baseEnv,
  };
}

export interface GoBuildOptions {
  /** Binary name (used for -o and output path). */
  name: string;

  /** BuiltRecipe for the C toolchain (gcc + glibc + busybox). */
  toolchain: BuiltRecipe;

  /** BuiltRecipe for the Go toolchain (go compiler). */
  goToolchain: BuiltRecipe;

  /** Source dependency name. When provided, builds from /deps/<source>. */
  source?: string;

  /** Inline Go source code for main.go (for test recipes). */
  mainGo?: string;

  /** Subdirectory within the source to build from (e.g. "src"). */
  sourceSubdir?: string;

  /** Additional source files: { "pkg/foo/foo.go": "..." }. */
  extraFiles?: Record<string, string>;

  /** Named dependencies (excluding toolchain and go, which are auto-injected). */
  deps: ProcessDependency[];

  /** Enable CGO (default: false). */
  cgo?: boolean;

  /** Runtime dependencies for ELF relocation. Auto-set if not provided:
   *   cgo=false → [], cgo=true → ["toolchain"]. */
  runtime_deps?: string[];

  /** Environment variables (merged with goProfile defaults). */
  env?: Record<string, string> | EnvEntry[];

  /** Additional go build flags (e.g., "-tags", "netgo"). */
  buildFlags?: string[];

  /** Go linker flags (e.g., "-X", "main.version=1.0"). */
  ldflags?: string[];

  /** Bitmask of unsafe flags. Bit 0 = allow networking. */
  unsafe_flags?: number;
}

/**
 * Build a Go binary using `go build` inside the sandbox.
 *
 * Uses shellBuild with goProfile defaults.  The profile provides:
 *   - shell: /deps/toolchain/bin/busybox
 *   - preamble: hermetic setup (always, even for cgo: false — busybox needs glibc linker)
 *   - env: PATH, GOROOT, GOCACHE, GOPATH, CGO_ENABLED, plus CC/CGO_LDFLAGS when cgo
 *
 * Source is prepared either from a named dependency or from inline Go code.
 * The output binary is stripped and placed at $OUT/bin/<name>.
 */
export async function goBuild(opts: GoBuildOptions): Promise<BuiltRecipe> {
  if (!opts.name || opts.name.trim() === "") {
    throw new Error("goBuild(): name is required");
  }
  if (!opts.toolchain) {
    throw new Error("goBuild(): toolchain is required");
  }
  if (!opts.goToolchain) {
    throw new Error("goBuild(): goToolchain is required");
  }
  if (!opts.source && !opts.mainGo) {
    throw new Error("goBuild(): either source or mainGo is required");
  }

  const tc = "toolchain";
  const goDep = "go";
  const cgo = opts.cgo ?? false;

  // Auto-inject toolchain and go deps.
  const deps: ProcessDependency[] = [
    dep(tc, opts.toolchain),
    dep(goDep, opts.goToolchain),
    ...(opts.deps ?? []),
  ];

  const profile = goProfile({ tc, go: goDep, cgo });

  // Merge user-supplied env over the profile defaults.
  const env: Record<string, string> = { ...profile.env };
  if (opts.env) {
    if (Array.isArray(opts.env)) {
      for (const entry of opts.env) {
        env[entry.key] = entry.value;
      }
    } else {
      Object.assign(env, opts.env);
    }
  }

  // Auto-set runtime_deps based on cgo mode.
  const runtime_deps = opts.runtime_deps ?? (cgo ? ["toolchain"] : []);

  // --- Source preparation ---
  const sourceSetupParts: string[] = [];

  if (opts.source) {
    const srcDep = opts.source;
    sourceSetupParts.push(`cp -a /deps/${srcDep}/. /tmp/build`);
    if (opts.sourceSubdir) {
      sourceSetupParts.push(`cd /tmp/build/${opts.sourceSubdir}`);
    }
  } else {
    // Inline Go source — create a minimal module
    sourceSetupParts.push("mkdir -p /tmp/build");

    sourceSetupParts.push("cat > /tmp/build/go.mod << 'GOMOD_EOF'");
    sourceSetupParts.push(`module ${opts.name}`);
    sourceSetupParts.push("");
    sourceSetupParts.push("go 1.24");
    sourceSetupParts.push("GOMOD_EOF");

    sourceSetupParts.push("");
    sourceSetupParts.push("cat > /tmp/build/main.go << 'MAIN_EOF'");
    sourceSetupParts.push(opts.mainGo!);
    sourceSetupParts.push("MAIN_EOF");

    for (const [filePath, content] of Object.entries(opts.extraFiles ?? {})) {
      const dir = filePath.includes("/") ? filePath.substring(0, filePath.lastIndexOf("/")) : "";
      const tag = filePath.replace(/[^a-zA-Z]/g, "_").toUpperCase() + "_EOF";
      if (dir) sourceSetupParts.push(`mkdir -p /tmp/build/${dir}`);
      sourceSetupParts.push(`cat > /tmp/build/${filePath} << '${tag}'`);
      sourceSetupParts.push(content);
      sourceSetupParts.push(tag);
    }
  }

  const sourceSetup = sourceSetupParts.join("\n");

  // Build go build command with optional ldflags and buildFlags
  const ldflagsPart = opts.ldflags && opts.ldflags.length > 0
    ? ` -ldflags '${opts.ldflags.join(" ")}'`
    : "";
  const buildFlagsPart = opts.buildFlags && opts.buildFlags.length > 0
    ? ` ${opts.buildFlags.join(" ")}`
    : "";

  const buildCmd = [
    !opts.sourceSubdir ? "cd /tmp/build" : "# already cd'd into sourceSubdir during source setup",
    `go build -trimpath${ldflagsPart}${buildFlagsPart} -o $OUT/bin/${opts.name} .`,
    "",
    // Strip the binary
    `${depSubpath(tc, "bin/strip")} $OUT/bin/${opts.name} 2>/dev/null || true`,
  ].join("\n");

  const fullScript = [
    sourceSetup,
    "",
    buildCmd,
  ].join("\n");

  return await shellBuild({
    shell: profile.shell,
    preamble: profile.preamble,
    env,
    deps,
    runtime_deps,
    unsafe_flags: opts.unsafe_flags,
    script: fullScript,
  });
}
