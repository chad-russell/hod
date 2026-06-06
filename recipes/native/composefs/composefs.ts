//! composefs build recipe — EROFS metadata + overlayfs for content-addressed FHS trees.
//!
//! Builds composefs 1.0.8, which provides mkcomposefs and mount.composefs.
//! These tools generate and mount EROFS metadata images backed by a content-addressed
//! object store, presenting a normal FHS filesystem without symlinks.
//!
//! Build dependencies: openssl (libcrypto)
//! Runtime dependencies: toolchain (glibc), openssl

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { composefsSourceRecipe } from "./composefs-source.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const composefsRuntimeDeps = ["openssl", "toolchain"];

const recipe = await shellBuild({
  ...mesonProfile({
    pkgConfigDeps: ["openssl"],
    libDeps: ["openssl"],
  }),
  sourceDir: true,
  script: `
meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Dman=disabled \\
  -Dfuse=disabled \\
  -Dwerror=false

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", composefsSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
    dep("zlib", zlibRecipe),
    dep("openssl", opensslRecipe),
  ],
  runtime_deps: composefsRuntimeDeps,
});

await importToStore(recipe);
export const composefsRecipe = recipe;
