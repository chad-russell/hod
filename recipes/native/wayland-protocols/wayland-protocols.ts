//! wayland-protocols native build recipe — standard Wayland protocol XML files.
//!
//! Builds Wayland Protocols 1.48. This is a data-only package that installs
//! Wayland protocol XML files and a pkg-config file, used by downstream
//! packages (like wl-clipboard, grim, slurp, fuzzel, etc.) to generate
//! protocol glue code at build time via wayland-scanner.
//!
//! Dependencies: wayland (for wayland-scanner, build-time only).
//! No runtime dependencies — this is purely build-time data.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { waylandProtocolsSourceRecipe } from "./wayland-protocols-source.js";
import { waylandRecipe } from "../wayland/wayland.js";
import { expatRecipe } from "../expat/expat.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...mesonProfile({
    includeDeps: ["wayland"],
    pkgConfigDeps: ["wayland"],
  }),
  sourceDir: true,
  script: `

# wayland-scanner is executed during build and needs its shared lib deps.
export LD_LIBRARY_PATH="/deps/expat/lib:/deps/libffi/lib:/deps/zlib/lib"

meson setup build \\
  --prefix=/ \\
  --buildtype=release \\
  -Dtests=false

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

# No binaries to strip — this is a data-only package.
# Clean up docs.
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info 2>/dev/null || true
`,
  deps: [
    dep("source", waylandProtocolsSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("wayland", waylandRecipe),
    dep("expat", expatRecipe),
    dep("libffi", libffiRecipe),
    dep("zlib", zlibRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const waylandProtocolsRecipe = recipe;
