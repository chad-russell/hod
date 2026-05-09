//! Cargo build helper for Rust packages.
//!
//! Creates a Process recipe that:
//!   1. Writes Cargo.toml + source files into the sandbox
//!   2. Runs `cargo build --release` using the prebuilt Rust toolchain
//!   3. Copies the compiled binary to `$OUT/bin/<name>`
//!
//! ## Runtime dependencies
//!
//! Compiled Rust binaries are statically linked by default (except for
//! libc/libgcc_s/ld-linux from the C toolchain). So `runtime_deps` only
//! needs the C toolchain — NOT the Rust toolchain.

import type { ProcessDependency } from "./dep.js";
import type { BuiltRecipe } from "./file.js";
import { hermeticPreamble } from "./preamble.js";
import { process, type EnvEntry } from "./process.js";

export interface CargoBuildOptions {
  /** Binary name (used for Cargo.toml [[bin]] and output path). */
  name: string;

  /** Dependency name providing `bin/busybox`, gcc, and glibc runtime. */
  toolchain: string;

  /** Dependency name providing `bin/rustc`, `bin/cargo`, and `lib/`. */
  rustToolchain: string;

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

  /** Contents of src/main.rs. Required unless `source` is provided. */
  mainRs?: string;

  /** Additional source files: { "src/lib.rs": "..." }. Paths relative to project root. */
  extraFiles?: Record<string, string>;

  /** Named dependencies mounted under `/deps/<name>/`. */
  deps: ProcessDependency[];

  /** Runtime dependencies for ELF relocation. */
  runtime_deps?: string[];

  /** Environment variables for the process recipe. */
  env?: Record<string, string> | EnvEntry[];

  /** Additional Cargo build flags (e.g., "--features", "feature1"). */
  cargoFlags?: string[];

  /** Bitmask of unsafe flags. Bit 0 = allow networking. */
  unsafe_flags?: number;
}

function normalizeEnv(env?: Record<string, string> | EnvEntry[]): Record<string, string> {
  const merged: Record<string, string> = {
    C_INCLUDE_PATH: "",
  };

  if (!env) {
    return merged;
  }

  if (Array.isArray(env)) {
    for (const entry of env) {
      merged[entry.key] = entry.value;
    }
    return merged;
  }

  return {
    ...merged,
    ...env,
  };
}

// Long dummy RUNPATH (same as shellBuild)
const DUMMY_RUNPATH =
  "/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/dummy";

// Avoid triggering Bun parser bug with `/*` inside template literals.
const PAT_SLASH_STAR = "/" + "*";

/**
 * Build a Rust binary using `cargo build --release` inside the sandbox.
 */
export async function cargoBuild(opts: CargoBuildOptions): Promise<BuiltRecipe> {
  if (!opts.name || opts.name.trim() === "") {
    throw new Error("cargoBuild(): name is required");
  }
  if (!opts.toolchain || opts.toolchain.trim() === "") {
    throw new Error("cargoBuild(): toolchain is required");
  }
  if (!opts.rustToolchain || opts.rustToolchain.trim() === "") {
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

  const deps = opts.deps ?? [];
  if (!deps.some((dep) => dep.name === opts.toolchain)) {
    throw new Error(
      `cargoBuild(): deps must include dep("${opts.toolchain}", ...) for the C toolchain`,
    );
  }
  if (!deps.some((dep) => dep.name === opts.rustToolchain)) {
    throw new Error(
      `cargoBuild(): deps must include dep("${opts.rustToolchain}", ...) for the Rust toolchain`,
    );
  }

  const tc = opts.toolchain;
  const rust = opts.rustToolchain;

  const preamble = hermeticPreamble({
    shell: tc,
    glibcLinker: tc,
  });

  // Current sandbox design mounts dependencies at canonical store-shaped paths
  // (/<shard>/<hash>/ with /deps/<name> symlinks into that topology), so
  // relocated toolchain binaries execute correctly when invoked from /deps.
  //
  // Older stores may still contain toolchains that embed a raw relative
  // ld-linux path instead of using the bootstrap path. Keep a best-effort
  // compatibility bridge for those older outputs, but skip it when the target
  // path already exists (the normal case with the current sandbox layout).
  const rustSandboxSetup = [
    "# Compatibility bridge for older relocated Rust toolchains (best-effort)",
    `HOD_RUST_INTERP=$(/deps/${tc}/bin/busybox grep -a -o 'fa/[0-9a-f]\\{64\\}/lib/ld-linux' /deps/${rust}/bin/rustc 2>/dev/null | /deps/${tc}/bin/busybox head -1 || true)`,
    'if [ -n "$HOD_RUST_INTERP" ] && [ ! -e "/$HOD_RUST_INTERP" ]; then',
    `  HOD_INTERP_DIR=$(/deps/${tc}/bin/busybox dirname "/\$HOD_RUST_INTERP")`,
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

  const toolchainEnv = [
    `export PATH=/deps/${tc}/bin:/deps/${rust}/bin`,
    `export CC="/deps/${tc}/bin/gcc --sysroot=/deps/${tc}/sysroot -B/deps/${tc}/bin"`,
    `export AR=/deps/${tc}/bin/ar`,
    `export RANLIB=/deps/${tc}/bin/ranlib`,
    `export STRIP=/deps/${tc}/bin/strip`,
    `export CFLAGS="-O2"`,
    "export CARGO_HOME=/tmp/.cargo",
  ].join("\n");

  const rpathEnv = [
    `export HOD_DUMMY_RPATH="-Wl,-rpath,${DUMMY_RUNPATH}"`,
    `export LDFLAGS="\${HOD_DUMMY_RPATH}"`,
  ].join("\n");

  // Cargo config to use the right linker and rustc
  // Both [build] rustflags and [target.*] linker are needed:
  // - [build] rustflags: applied to build scripts and target compilation
  // - [target.*] linker: applied to target compilation (build scripts use cc)
  // We don't use -B/deps/<tc>/bin because that overrides the Rust-bundled ld.lld
  // with our GNU ld, which then can't find crt files. Instead we use --sysroot
  // and -L flags only, and let rustc use its bundled lld.
  const cargoConfig = [
    "[build]",
    `rustc = "/deps/${rust}/bin/rustc"`,
    `rustdoc = "/deps/${rust}/bin/rustdoc"`,
    `rustflags = ["-C", "link-arg=--sysroot=/deps/${tc}/sysroot", "-C", "link-arg=-L/deps/${tc}/sysroot/lib", "-C", "link-arg=-L/deps/${tc}/lib", "-C", "link-arg=-Wl,--sysroot=/deps/${tc}/sysroot", "-C", "link-arg=-Wl,-rpath,${DUMMY_RUNPATH}"]`,
    "",
    "[target.x86_64-unknown-linux-gnu]",
    `linker = "/deps/${tc}/bin/gcc"`,
  ].join("\n");

  // Build the source preparation section
  const sourceSetupParts: string[] = [];

  if (opts.source) {
    // Extract source tarball from the named dependency
    const srcDep = opts.source;
    sourceSetupParts.push("mkdir -p /tmp/build");
    sourceSetupParts.push(`tar xf /deps/${srcDep}/source -C /tmp/build --strip-components=1`);
  } else {
    // Write inline source files
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
  // and point at the sandbox's toolchain
  sourceSetupParts.push("mkdir -p /tmp/build/.cargo");
  sourceSetupParts.push("cat > /tmp/build/.cargo/config.toml << 'CONFIG_EOF'");
  sourceSetupParts.push(cargoConfig);
  sourceSetupParts.push("CONFIG_EOF");

  const sourceSetup = sourceSetupParts.join("\n");

  const cargoFlags = opts.cargoFlags ? ` ${opts.cargoFlags.join(" ")}` : "";

  // Build LD_LIBRARY_PATH from all deps that have a lib/ directory.
  // This ensures the dynamic linker can find all needed shared libraries.
  // We always include rust and toolchain explicitly since they're required.
  const libPathParts = [
    `/deps/${rust}/lib`,
    `/deps/${tc}/lib`,
  ];
  for (const dep of deps) {
    if (dep.name !== tc && dep.name !== rust) {
      libPathParts.push(`/deps/${dep.name}/lib`);
    }
  }

  const buildCmd = [
    "cd /tmp/build",
    `export LD_LIBRARY_PATH=${libPathParts.join(":")}`,
    `cargo build --release --target x86_64-unknown-linux-gnu${cargoFlags}`,
    "",
    "mkdir -p $OUT/bin",
    `cp /tmp/build/target/x86_64-unknown-linux-gnu/release/${opts.name} $OUT/bin/${opts.name}`,
    `/deps/${tc}/bin/strip $OUT/bin/${opts.name} 2>/dev/null || true`,
  ].join("\n");

  const fullScript = [
    "set -e",
    "",
    preamble,
    toolchainEnv,
    rpathEnv,
    "",
    rustSandboxSetup,
    "",
    sourceSetup,
    "",
    buildCmd,
  ].join("\n");

  return await process({
    platform: "x86_64-linux",
    command: `/deps/${tc}/bin/busybox`,
    args: ["sh", "-c", fullScript],
    env: normalizeEnv(opts.env),
    dependencies: deps,
    runtime_deps: opts.runtime_deps,
    unsafe_flags: opts.unsafe_flags,
  });
}
