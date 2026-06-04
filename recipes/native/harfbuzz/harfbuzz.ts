//! harfbuzz build recipe — text shaping library.
//!
//! Builds HarfBuzz 10.2.0 with FreeType and GLib integration enabled.
//! GLib integration provides hb-glib.h which is needed by GTK4.
//! GObject subtyping is disabled to keep the dependency chain simpler.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { harfbuzzSourceRecipe } from "./harfbuzz-source.js";
import { freetypeRecipe } from "../freetype/freetype.js";
import { glibRecipe } from "../glib/glib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { libpngRecipe } from "../libpng/libpng.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const harfbuzzRuntimeDeps = [
  "bzip2", "freetype", "glib", "libffi", "libpng", "pcre2", "toolchain", "zlib",
];

const recipe = await shellBuild({
  ...mesonProfile({
    cxx: true,
    python: "python",
    binDeps: ["glib"],
    includeDeps: ["freetype", "glib", "libffi", "pcre2", "bzip2", "libpng", "zlib"],
    includePaths: ["/deps/freetype/include/freetype2"],
    libDeps: ["freetype", "glib", "libffi", "pcre2", "bzip2", "libpng", "zlib"],
    pkgConfigDeps: ["freetype", "glib", "libffi", "pcre2", "bzip2", "libpng", "zlib"],
  }),
  sourceDir: true,
  script: `
export CXXFLAGS="-O2 -I/deps/freetype/include/freetype2"
export CPPFLAGS="-I/deps/freetype/include/freetype2"

export LD_LIBRARY_PATH="/deps/glib/lib:/deps/libffi/lib:/deps/pcre2/lib:/deps/zlib/lib:/deps/bzip2/lib:/deps/freetype/lib:/deps/libpng/lib"
export LDFLAGS="$HOD_DUMMY_RPATH \
  -Wl,-rpath-link,/deps/glib/lib -Wl,-rpath-link,/deps/libffi/lib \
  -Wl,-rpath-link,/deps/pcre2/lib -Wl,-rpath-link,/deps/zlib/lib \
  -Wl,-rpath-link,/deps/bzip2/lib -Wl,-rpath-link,/deps/freetype/lib \
  -Wl,-rpath-link,/deps/libpng/lib"

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddefault_library=shared \\
  -Dglib=enabled \\
  -Dgobject=disabled \\
  -Dcairo=disabled \\
  -Dchafa=disabled \\
  -Dicu=disabled \\
  -Dgraphite=disabled \\
  -Dgraphite2=disabled \\
  -Dfreetype=enabled \\
  -Dtests=disabled \\
  -Dintrospection=disabled \\
  -Ddocs=disabled \\
  -Dutilities=disabled

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
${STRIP_ALL}
`,
  deps: [
    dep("source", harfbuzzSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("freetype", freetypeRecipe),
    dep("glib", glibRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("bzip2", bzip2Recipe),
    dep("libpng", libpngRecipe),
    dep("zlib", zlibRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: harfbuzzRuntimeDeps,
});

await importToStore(recipe);
export const harfbuzzRecipe = recipe;
