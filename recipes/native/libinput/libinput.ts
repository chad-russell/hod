//! libinput build recipe — input device management library.
//!
//! Builds libinput 1.27.0, providing the input stack for Wayland compositors.
//! Used by cosmic-comp (via Smithay) for keyboard, mouse, and touchpad input.
//!
//! Dependencies: libevdev, mtdev, libudev (from eudev), libseat (seatd).
//! We disable libwacom (tablet support not needed for VM) and documentation.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libinputSourceRecipe } from "./libinput-source.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { libevdevRecipe } from "../libevdev/libevdev.js";
import { mtdevRecipe } from "../mtdev/mtdev.js";
import { eudevRecipe } from "../eudev/eudev.js";
import { seatdRecipe } from "../seatd/seatd.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const libinputRuntimeDeps = ["eudev", "libevdev", "mtdev", "seatd", "toolchain"];

const recipe = await shellBuild({
  ...mesonProfile({
    pkgConfigDeps: ["libevdev", "mtdev", "eudev", "seatd"],
    includeDeps: ["libevdev", "mtdev", "eudev", "seatd"],
    libDeps: ["mtdev"],
  }),
  sourceDir: true,
  script: `
meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Dlibwacom=false \\
  -Ddocumentation=false \\
  -Dtests=false \\
  -Ddebug-gui=false

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}
for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  sed -i 's|^exec_prefix=.*|exec_prefix=\\\${prefix}|' "$pc"
  sed -i 's|^libdir=.*|libdir=\\\${prefix}/lib|' "$pc"
  sed -i 's|^includedir=.*|includedir=\\\${prefix}/include|' "$pc"
done

${STRIP_ALL}
`,
  deps: [
    dep("source", libinputSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
    dep("zlib", zlibRecipe),
    dep("libevdev", libevdevRecipe),
    dep("mtdev", mtdevRecipe),
    dep("eudev", eudevRecipe),
    dep("seatd", seatdRecipe),
  ],
  runtime_deps: libinputRuntimeDeps,
});

await importToStore(recipe);
export const libinputRecipe = recipe;
