//! Rust build profile + cargoBuild driver.
//!
//! Provides the standard environment for Rust/Cargo builds and the `cargoBuild`
//! convenience helper that wraps shell-driven builds with Cargo-specific setup.
//!
//! Usage (profile only):
//!   import { rustProfile } from "../helpers/rust.js";
//!   shellBuild({ ...rustProfile(), deps: [...], script: `...` });
//!
//! Usage (cargoBuild):
//!   import { cargoBuild } from "../helpers/rust.js";
//!   const recipe = await cargoBuild({ name: "rg", toolchain: tc, rustToolchain: rust, ... });

import {
  hermeticPreamble,
  HOD_DUMMY_RPATH_FLAG,
  dep,
  shellBuild,
} from "../../js/src/index.js";
import type { ProcessDependency } from "../../js/src/dep.js";
import type { BuiltRecipe } from "../../js/src/file.js";
import type { EnvEntry } from "../../js/src/process.js";

export interface RustProfileOptions {
  /** Dep name for the C toolchain bundle (default: "toolchain"). */
  tc?: string;
  /** Dep name for the Rust toolchain bundle (default: "rust"). */
  rust?: string;
}

/**
 * Return environment defaults for a Rust/Cargo build.
 *
 * Returns shell, preamble, and process-level env vars.  Use with shellBuild:
 *
 *   shellBuild({ ...rustProfile(), deps: [...], script: `...` });
 */
export function rustProfile(opts: RustProfileOptions = {}): {
  shell: string;
  preamble: string;
  env: Record<string, string>;
} {
  const tc = opts.tc ?? "toolchain";
  const rust = opts.rust ?? "rust";

  return {
    shell: `/deps/${tc}/bin/busybox`,
    preamble: hermeticPreamble({ shell: tc, glibcLinker: tc }),
    env: {
      PATH: `/deps/${tc}/bin:/deps/${rust}/bin`,
      CC: `/deps/${tc}/bin/gcc --sysroot=/deps/${tc}/sysroot -B/deps/${tc}/bin`,
      AR: `/deps/${tc}/bin/ar`,
      RANLIB: `/deps/${tc}/bin/ranlib`,
      STRIP: `/deps/${tc}/bin/strip`,
      CFLAGS: "-O2",
      C_INCLUDE_PATH: "",
      CARGO_HOME: "/tmp/.cargo",
      HOD_DUMMY_RPATH: HOD_DUMMY_RPATH_FLAG,
      LDFLAGS: HOD_DUMMY_RPATH_FLAG,
    },
  };
}

export interface CargoBuildOptions {
  /** Binary name (used for Cargo.toml [[bin]] and output path). */
  name: string;

  /** BuiltRecipe for the C toolchain (gcc + glibc). */
  toolchain: BuiltRecipe;

  /** BuiltRecipe for the Rust toolchain (rustc + cargo). */
  rustToolchain: BuiltRecipe;

  /**
   * Source dependency name. When provided, the source tarball is extracted
   * from `/deps/<source>/source` into the build directory. The tarball's
   * top-level directory is stripped (--strip-components=1).
   *
   * When `source` is set, `cargoToml` and `mainRs` are not required — the
   * source's own Cargo.toml is used. When `source` is not set, `cargoToml`
   * and `mainRs` are required and source files are written inline.
   */
  source?: string;

  /** Contents of Cargo.toml. Required unless `source` is provided. */
  cargoToml?: string;

  /** Contents of src/main.rs. Required unless `source` is not provided. */
  mainRs?: string;

  /** Additional source files: { "src/lib.rs": "..." }. Paths relative to project root. */
  extraFiles?: Record<string, string>;

  /** Additional binaries to copy from the release directory (beyond `name`).
   *  Useful for Cargo workspaces that produce multiple executables. */
  extraBinaries?: string[];

  /** Named dependencies mounted under `/deps/<name>/` (excluding toolchain and rust, which are auto-injected). */
  deps: ProcessDependency[];

  /** Runtime dependencies for ELF relocation. */
  runtime_deps?: string[];

  /** Environment variables for the process recipe (merged with rustProfile defaults). */
  env?: Record<string, string> | EnvEntry[];

  /** Additional Cargo build flags (e.g., "--features", "feature1"). */
  cargoFlags?: string[];

  /** Bitmask of unsafe flags. Bit 0 = allow networking. */
  unsafe_flags?: number;

  /** Shell commands to run after source extraction but before `cargo build`. */
  preBuildScript?: string;
}

/**
 * Build a Rust binary using `cargo build --release` inside the sandbox.
 *
 * Uses shellBuild with rustProfile defaults.  The profile provides:
 *   - shell: /deps/toolchain/bin/busybox
 *   - preamble: ld-linux + glibc symlinks
 *   - env: PATH, CC, AR, RANLIB, STRIP, CFLAGS, CARGO_HOME, LDFLAGS + dummy RUNPATH
 */
export async function cargoBuild(opts: CargoBuildOptions): Promise<BuiltRecipe> {
  if (!opts.name || opts.name.trim() === "") {
    throw new Error("cargoBuild(): name is required");
  }
  if (!opts.toolchain) {
    throw new Error("cargoBuild(): toolchain is required");
  }
  if (!opts.rustToolchain) {
    throw new Error("cargoBuild(): rustToolchain is required");
  }
  if (!opts.source) {
    if (!opts.cargoToml || opts.cargoToml.trim() === "") {
      throw new Error("cargoBuild(): cargoToml is required when source is not provided");
    }
    if (!opts.mainRs) {
      throw new Error("cargoBuild(): mainRs is required when source is not provided");
    }
  }

  const tc = "toolchain";
  const rust = "rust";

  // Auto-inject toolchain and rust deps.  Use dep() to normalize
  // BuiltRecipe → {name, recipe_hash}.
  const deps: ProcessDependency[] = [
    dep(tc, opts.toolchain),
    dep(rust, opts.rustToolchain),
    ...(opts.deps ?? []),
  ];

  const profile = rustProfile({ tc, rust });

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

  // --- Script body ---
  //
  // shellBuild handles set -e, preamble, and process-level env.  The script
  // only contains Rust-specific sandbox setup, source unpacking, and the
  // cargo build steps.

  // Compatibility bridge for older relocated Rust toolchains.  Not needed
  // for current stores (canonical sandbox paths handle this), but kept as a
  // best-effort fallback for historical artifacts.
  const rustSandboxSetup = [
    "# Compatibility bridge for older relocated Rust toolchains (best-effort)",
    `HOD_RUST_INTERP=$(/deps/${tc}/bin/busybox grep -a -o 'fa/[0-9a-f]\\{64\\}/lib/ld-linux' /deps/${rust}/bin/rustc 2>/dev/null | /deps/${tc}/bin/busybox head -1 || true)`,
    'if [ -n "$HOD_RUST_INTERP" ] && [ ! -e "/$HOD_RUST_INTERP" ]; then',
    `  HOD_INTERP_DIR=$(/deps/${tc}/bin/busybox dirname "/\\$HOD_RUST_INTERP")`,
    '  "$HOD_SHELL_BUSYBOX" mkdir -p "$HOD_INTERP_DIR"',
    `  "$HOD_SHELL_BUSYBOX" cp /deps/${tc}/sysroot/lib/ld-linux-x86-64.so.2 "$HOD_INTERP_DIR/ld-linux-x86-64.so.2" 2>/dev/null || true`,
    "  # Older cargo setups may exec from registry source directories.",
    '  for base in "$HOME/.cargo/registry" "$HOME/.cargo/registry/src" "$CARGO_HOME/registry" "$CARGO_HOME/registry/src"; do',
    '    if [ -n "$base" ]; then',
    '      BDIR="$base/$HOD_INTERP_DIR"',
    '      "$HOD_SHELL_BUSYBOX" mkdir -p "$BDIR"',
    `      "$HOD_SHELL_BUSYBOX" cp /deps/${tc}/sysroot/lib/ld-linux-x86-64.so.2 "$BDIR/ld-linux-x86-64.so.2" 2>/dev/null || true`,
    '    fi',
    '  done',
    "fi",
    "# Copy crt startup files to /lib/ for the linker",
    `"$HOD_SHELL_BUSYBOX" cp /deps/${tc}/sysroot/lib/Scrt1.o /lib/ 2>/dev/null || true`,
    `"$HOD_SHELL_BUSYBOX" cp /deps/${tc}/sysroot/lib/crti.o /lib/ 2>/dev/null || true`,
    `"$HOD_SHELL_BUSYBOX" cp /deps/${tc}/sysroot/lib/crtn.o /lib/ 2>/dev/null || true`,
    `"$HOD_SHELL_BUSYBOX" cp /deps/${tc}/sysroot/lib/crt1.o /lib/ 2>/dev/null || true`,
  ].join("\n");

  // Cargo config to use the right linker and rustc
  const cargoConfig = [
    "[build]",
    `rustc = "/deps/${rust}/bin/rustc"`,
    `rustdoc = "/deps/${rust}/bin/rustdoc"`,
    `rustflags = ["-C", "link-arg=--sysroot=/deps/${tc}/sysroot", "-C", "link-arg=-L/deps/${tc}/sysroot/lib", "-C", "link-arg=-L/deps/${tc}/lib", "-C", "link-arg=-Wl,--sysroot=/deps/${tc}/sysroot", "-C", "link-arg=${HOD_DUMMY_RPATH_FLAG}"]`,
    "",
    "[target.x86_64-unknown-linux-gnu]",
    `linker = "/deps/${tc}/bin/gcc"`,
  ].join("\n");

  // Source preparation — extract tarball or write inline files
  const sourceSetupParts: string[] = [];

  if (opts.source) {
    const srcDep = opts.source;
    // fetchTarball() sources produce already-extracted directories.
    // Copy the extracted tree directly (top-level dir already stripped by fetchTarball).
    sourceSetupParts.push(`cp -a /deps/${srcDep}/. /tmp/build`);
  } else {
    sourceSetupParts.push("mkdir -p /tmp/build/src");
    sourceSetupParts.push("");
    sourceSetupParts.push("cat > /tmp/build/Cargo.toml << 'CARGO_EOF'");
    sourceSetupParts.push(opts.cargoToml!);
    sourceSetupParts.push("CARGO_EOF");
    sourceSetupParts.push("");
    sourceSetupParts.push("cat > /tmp/build/src/main.rs << 'MAIN_EOF'");
    sourceSetupParts.push(opts.mainRs!);
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

  // Always write .cargo/config.toml to override any source-provided config
  sourceSetupParts.push("mkdir -p /tmp/build/.cargo");
  sourceSetupParts.push("cat > /tmp/build/.cargo/config.toml << 'CONFIG_EOF'");
  sourceSetupParts.push(cargoConfig);
  sourceSetupParts.push("CONFIG_EOF");

  const sourceSetup = sourceSetupParts.join("\n");

  const cargoFlags = opts.cargoFlags ? ` ${opts.cargoFlags.join(" ")}` : "";

  // Build LD_LIBRARY_PATH from all deps that have a lib/ directory.
  const libPathParts = [
    `/deps/${rust}/lib`,
    `/deps/${tc}/lib`,
  ];
  for (const d of opts.deps ?? []) {
    if (d.name !== tc && d.name !== rust) {
      libPathParts.push(`/deps/${d.name}/lib`);
    }
  }

  // All binaries to copy from the release directory.
  const binaries = [opts.name, ...(opts.extraBinaries ?? [])];
  const copyCmds = binaries.map(b =>
    `cp /tmp/build/target/x86_64-unknown-linux-gnu/release/${b} $OUT/bin/${b}\n` +
    `/deps/${tc}/bin/strip $OUT/bin/${b} 2>/dev/null || true`
  ).join("\n");

  const buildCmd = [
    "cd /tmp/build",
    `export LD_LIBRARY_PATH=${libPathParts.join(":")}`,
    ...(opts.preBuildScript ? [opts.preBuildScript] : []),
    `cargo build --release --target x86_64-unknown-linux-gnu${cargoFlags}`,
    "",
    "mkdir -p $OUT/bin",
    copyCmds,
  ].join("\n");

  // shellBuild handles set -e, the preamble, and sets env vars from rustProfile.
  // The script body only contains Rust-specific sandbox setup, source unpacking,
  // and the cargo build.
  const fullScript = [
    rustSandboxSetup,
    "",
    sourceSetup,
    "",
    buildCmd,
  ].join("\n");

  return await shellBuild({
    shell: profile.shell,
    preamble: profile.preamble,
    env,
    deps,
    runtime_deps: opts.runtime_deps,
    unsafe_flags: opts.unsafe_flags,
    script: fullScript,
  });
}
