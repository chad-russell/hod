//! libdisplay-info build recipe — EDID/DisplayID parsing library.
//!
//! Builds libdisplay-info 0.3.0, a library for parsing EDID and DisplayID
//! display metadata. Used by cosmic-comp for display identification.
//!
//! Dependencies at runtime: toolchain (glibc).
//! Build-time only: meson, ninja, hwdata (for PNP ID table generation).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libdisplayInfoSourceRecipe } from "./libdisplay-info-source.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { hwdataRecipe } from "../hwdata/hwdata.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const libdisplayInfoRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    pkgConfigDeps: ["hwdata"],
  }),
  sourceDir: true,
  script: `
# Provide hwdata pnp.ids path for code generation
# The meson.build looks for hwdata pkg-config which we set up via PKG_CONFIG_PATH
export LD_LIBRARY_PATH="/deps/zlib/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", libdisplayInfoSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
    dep("zlib", zlibRecipe),
    dep("hwdata", hwdataRecipe),
  ],
  runtime_deps: libdisplayInfoRuntimeDeps,
});

await importToStore(recipe);
export const libdisplayInfoRecipe = recipe;
