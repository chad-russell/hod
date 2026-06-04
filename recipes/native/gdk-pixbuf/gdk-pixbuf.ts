//! gdk-pixbuf build recipe — image loading library for GTK.
//!
//! Builds gdk-pixbuf 2.42.12 with PNG/GIF/JPEG/TIFF support.
//! Required by GTK4 which needs JPEG/TIFF loaders.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { gdkPixbufSourceRecipe } from "./gdk-pixbuf-source.js";
import { glibRecipe } from "../glib/glib.js";
import { libpngRecipe } from "../libpng/libpng.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { expatRecipe } from "../expat/expat.js";
import { libjpegRecipe } from "../libjpeg/libjpeg.js";
import { libtiffRecipe } from "../libtiff/libtiff.js";
import { xzRecipe } from "../xz/xz.js";
import { zstdRecipe } from "../zstd/zstd.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const gdkPixbufRuntimeDeps = ["glib", "libffi", "libjpeg", "libpng", "libtiff", "pcre2", "toolchain", "xz", "zlib", "zstd"];

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    binDeps: ["glib"],
    includeDeps: ["glib", "libpng", "zlib", "libffi", "pcre2", "libjpeg", "libtiff", "xz", "zstd"],
    libDeps: ["glib", "libpng", "zlib", "libffi", "pcre2", "libjpeg", "libtiff", "xz", "zstd"],
    pkgConfigDeps: ["glib", "libpng", "zlib", "libffi", "pcre2", "libjpeg", "libtiff", "xz", "zstd"],
  }),
  sourceDir: true,
  script: `
export LD_LIBRARY_PATH="/tmp/build/build/gdk-pixbuf:/deps/glib/lib:/deps/libpng/lib:/deps/zlib/lib:/deps/libffi/lib:/deps/pcre2/lib:/deps/libjpeg/lib:/deps/libtiff/lib:/deps/xz/lib:/deps/zstd/lib"

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddefault_library=shared \\
  -Dpng=enabled \\
  -Djpeg=enabled \\
  -Dtiff=enabled \\
  -Dgif=enabled \\
  -Dothers=disabled \\
  -Dintrospection=disabled \\
  -Dgtk_doc=false \\
  -Ddocs=false \\
  -Dman=false \\
  -Dtests=false \\
  -Dinstalled_tests=false \\
  -Dgio_sniffing=false

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", gdkPixbufSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("glib", glibRecipe),
    dep("libpng", libpngRecipe),
    dep("zlib", zlibRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("expat", expatRecipe),
    dep("libjpeg", libjpegRecipe),
    dep("libtiff", libtiffRecipe),
    dep("xz", xzRecipe),
    dep("zstd", zstdRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: gdkPixbufRuntimeDeps,
});

await importToStore(recipe);
export const gdkPixbufRecipe = recipe;
