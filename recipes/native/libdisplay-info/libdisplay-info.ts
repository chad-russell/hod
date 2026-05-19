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
import { STRIP_ALL } from "../../helpers/strip.js";

export const libdisplayInfoRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    pkgConfigDeps: ["hwdata"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# Provide hwdata pnp.ids path for code generation
# The meson.build looks for hwdata pkg-config which we set up via PKG_CONFIG_PATH
export LD_LIBRARY_PATH="/deps/zlib/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release

ninja -C build
DESTDIR=$OUT ninja -C build install

# Make pkg-config files relocatable
for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  sed -i 's|^prefix=.*|prefix=\\\${pcfiledir}/../..|' "$pc"
done

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
