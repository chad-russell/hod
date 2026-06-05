//! fuse3 build recipe — FUSE (Filesystem in Userspace) library and utilities.
//!
//! Builds libfuse 3.18.2. Provides libfuse3.so, fusermount3, and mount.fuse3.
//! Required by ostree and flatpak for filesystem operations.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { fuse3SourceRecipe } from "./fuse3-source.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { RELOCATE_PKG_CONFIG, STRIP_ALL } from "../../helpers/strip.js";

export const fuse3RuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
  }),
  sourceDir: true,
  script: `
meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Dutils=true \\
  -Dexamples=false \\
  -Dtests=false \\
  -Duseroot=false \\
  -Ddisable-mtab=false

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
rm -rf $OUT/share/man $OUT/share/doc
`,
  deps: [
    dep("source", fuse3SourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: fuse3RuntimeDeps,
});

await importToStore(recipe);
export const fuse3Recipe = recipe;
