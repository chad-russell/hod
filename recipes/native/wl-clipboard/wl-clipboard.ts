//! wl-clipboard native build recipe — Wayland clipboard utilities.
//!
//! Builds wl-clipboard 2.3.0, providing wl-copy and wl-paste command-line tools
//! for the Wayland clipboard. Dependencies: wayland, wayland-protocols (all built).
//!
//! Produces:
//!   - wl-copy (copy to Wayland clipboard from stdin/args)
//!   - wl-paste (paste from Wayland clipboard to stdout)
//!   - Shell completions (bash, zsh, fish)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { wlClipboardSourceRecipe } from "./wl-clipboard-source.js";
import { waylandRecipe, waylandRuntimeDeps } from "../wayland/wayland.js";
import { waylandProtocolsRecipe } from "../wayland-protocols/wayland-protocols.js";
import { expatRecipe } from "../expat/expat.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...mesonProfile({
    includeDeps: ["wayland"],
    libDeps: ["wayland"],
    pkgConfigDeps: ["wayland", "wayland-protocols", "expat", "libffi"],
    // TODO: pkgConfigPaths no longer needed — cProfile() now auto-includes
    // both lib/pkgconfig and share/pkgconfig for each pkgConfigDeps entry.
    // Add "wayland-protocols" to pkgConfigDeps and remove this block.
    pkgConfigPaths: ["/deps/wayland-protocols/share/pkgconfig"],
  }),
  sourceDir: true,
  script: `

# wl-clipboard's meson.build uses find_program('wayland-scanner', native: true)
# so it needs to be on PATH.
export PATH="/deps/wayland/bin:$PATH"

# wayland-scanner needs its shared lib deps at runtime during build.
export LD_LIBRARY_PATH="/deps/expat/lib:/deps/wayland/lib:/deps/zlib/lib"

meson setup build \\
  --prefix=/ \\
  --buildtype=release \\
  -Dprotocols=enabled

ninja -C build
DESTDIR=$OUT ninja -C build install

${STRIP_BINARIES}
rm -rf $OUT/share/doc $OUT/share/info 2>/dev/null || true
`,
  deps: [
    dep("source", wlClipboardSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("wayland", waylandRecipe),
    dep("wayland-protocols", waylandProtocolsRecipe),
    dep("expat", expatRecipe),
    dep("libffi", libffiRecipe),
    dep("zlib", zlibRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: [...waylandRuntimeDeps, "wayland"],
});

await importToStore(recipe);
export const wlClipboardRecipe = recipe;
