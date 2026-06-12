//! hod-launcher — the static argv[0]-preserving wrapper binary.
//!
//! This builds `launcher/hod-launcher.c` into a single statically-linked
//! (musl) ELF installed at `libexec/hod-launcher`. The Hod build system stamps
//! a copy of this binary over each wrapped executable (in place of the legacy
//! POSIX-shell wrappers) and writes a per-binary manifest beside it; see
//! `src/manifest.rs` and `src/wrap.rs`.
//!
//! Why musl-static:
//!
//! - **No PT_INTERP** → the launcher needs no relocation/wrapping itself (the
//!   static-ELF guard in `src/wrap.rs` skips it), and it works as a kernel
//!   entry point with no `/bin/sh` dependency.
//! - **Self-contained** → a single content-hashed artifact, copy-closure-safe.
//!
//! The build mirrors `recipes/bootstrap/busybox-from-source.ts`: it uses the
//! seed musl toolchain via a `-B` gcc wrapper and compiles with `-static`.
import {
  process,
  dep,
  importToStore,
  registerLauncher,
  hermeticPreamble,
  fileFromPath,
} from "../../../js/src/index.js";
import { seedRootRecipe } from "../../bootstrap/seed-root.js";

const preamble = hermeticPreamble({
  shell: "seed",
  muslLinker: "seed",
});

// Content-addressed import of the launcher C source. The recipe hash tracks
// the source contents, so changing the launcher re-identifies it.
// `fileFromPath` imports the content blob, but the File *recipe* itself must
// still be registered in the store (importToStore only stores the recipe it is
// given — dependency recipes are referenced by hash, not imported recursively),
// otherwise building hod-launcher fails with "recipe ... not in the store".
const source = await fileFromPath("launcher/hod-launcher.c");
await importToStore(source);

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

export PATH=/tmp/gcc-wrapper:/deps/seed/bin

# The musl.cc gcc has hardcoded host paths; use -B to point it at the seed
# toolchain's cc1, collect2, crt*.o, libc.a, etc. inside the sandbox.
mkdir -p /tmp/gcc-wrapper
cat > /tmp/gcc-wrapper/gcc << 'WRAPPER'
#!/bin/sh
exec /deps/seed/bin/gcc \\
  -B/deps/seed/libexec/gcc/x86_64-linux-musl/11.2.1/ \\
  -B/deps/seed/lib/gcc/x86_64-linux-musl/11.2.1/ \\
  -B/deps/seed/x86_64-linux-musl/lib/ \\
  -I/deps/seed/include \\
  -L/deps/seed/lib \\
  "$@"
WRAPPER
chmod +x /tmp/gcc-wrapper/gcc

# Compile the launcher as a fully static musl binary.
mkdir -p $OUT/libexec
# File deps are mounted at /deps/<name>/<name>, so the source lands at
# /deps/source/source (the launcher .c, content-addressed via fileFromPath).
# The mounted file has no .c extension, so pass -x c to tell gcc it is C
# source (otherwise gcc hands it to the linker → "file format not recognized").
/tmp/gcc-wrapper/gcc -O2 -static -x c -o $OUT/libexec/hod-launcher /deps/source/source
chmod +x $OUT/libexec/hod-launcher

# Sanity: must be a static ELF (no PT_INTERP). readelf is provided by seed.
readelf -l $OUT/libexec/hod-launcher | grep -q INTERP && {
  echo "error: hod-launcher unexpectedly has a PT_INTERP (not static)" >&2
  exit 1
}
echo "hod-launcher built (static)"`,
  ],
  dependencies: [
    dep("seed", seedRootRecipe),
    dep("source", source),
  ],
});

await importToStore(recipe);
// Register this as the store's active launcher so the build system can stamp it
// over wrapped executables without any package depending on it. The launcher is
// build-system infrastructure, not a recipe dependency.
await registerLauncher(recipe.hash);
export const hodLauncherRecipe = recipe;
