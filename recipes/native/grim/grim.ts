//! grim native build recipe — Wayland screenshot capture.
//!
//! Builds grim 1.4.0, a command-line utility to grab images from a Wayland
//! compositor. Works with sway, Hyprland, and other wlroots-based compositors.
//!
//! Dependencies: wayland, wayland-protocols, pixman, libpng (all built).
//! JPEG support disabled to avoid the libjpeg-turbo dependency.
//!
//! Produces:
//!   - grim (screenshot capture tool)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { grimSourceRecipe } from "./grim-source.js";
import { waylandRecipe, waylandRuntimeDeps } from "../wayland/wayland.js";
import { waylandProtocolsRecipe } from "../wayland-protocols/wayland-protocols.js";
import { expatRecipe } from "../expat/expat.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { pixmanRecipe, pixmanRuntimeDeps } from "../pixman/pixman.js";
import { libpngRecipe, libpngRuntimeDeps } from "../libpng/libpng.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...mesonProfile({
    includeDeps: ["wayland", "pixman", "libpng"],
    libDeps: ["wayland", "pixman", "libpng"],
    pkgConfigDeps: ["wayland", "wayland-protocols", "pixman", "libpng", "zlib", "libffi", "expat"],
    // TODO: pkgConfigPaths no longer needed — cProfile() now auto-includes
    // both lib/pkgconfig and share/pkgconfig for each pkgConfigDeps entry.
    // Add "wayland-protocols" to pkgConfigDeps and remove this block.
    pkgConfigPaths: ["/deps/wayland-protocols/share/pkgconfig"],
  }),
  sourceDir: true,
  script: `
# wayland-scanner needs its shared lib deps at runtime during build.
export LD_LIBRARY_PATH="/deps/expat/lib:/deps/wayland/lib:/deps/zlib/lib"

# grim's protocol/meson.build uses find_program('wayland-scanner')
export PATH="/deps/wayland/bin:$PATH"

meson setup build \\
  --prefix=/ \\
  --buildtype=release \\
  -Djpeg=disabled \\
  -Dman-pages=disabled \\
  -Dbash-completions=false \\
  -Dfish-completions=false

ninja -C build
DESTDIR=$OUT ninja -C build install

# Strip binary
${STRIP_BINARIES}

# Clean up
rm -rf $OUT/share/doc $OUT/share/man 2>/dev/null || true
`,
  deps: [
    dep("source", grimSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("wayland", waylandRecipe),
    dep("wayland-protocols", waylandProtocolsRecipe),
    dep("expat", expatRecipe),
    dep("libffi", libffiRecipe),
    dep("zlib", zlibRecipe),
    dep("pixman", pixmanRecipe),
    dep("libpng", libpngRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: [...new Set([
    ...waylandRuntimeDeps,
    ...pixmanRuntimeDeps,
    ...libpngRuntimeDeps,
  ])],
});

await importToStore(recipe);
export const grimRecipe = recipe;
