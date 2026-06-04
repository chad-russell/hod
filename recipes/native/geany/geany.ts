//! geany build recipe — lightweight GTK3 IDE.
//!
//! Builds Geany 2.1, a fast and lightweight text editor / IDE using GTK3.
//! Uses autotools (configure + make). Dependencies: GTK3, GLib, gmodule-2.0.
//!
//! All transitive deps from GTK3 must be listed since `shellBuild` only
//! mounts explicitly declared deps, and geany needs them all for linking.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { geanySourceRecipe } from "./geany-source.js";
import { gtk3Recipe, gtk3RuntimeDeps } from "../gtk3/gtk3.js";
import { glibRecipe } from "../glib/glib.js";
import { pangoRecipe } from "../pango/pango.js";
import { cairoRecipe } from "../cairo/cairo.js";
import { gdkPixbufRecipe } from "../gdk-pixbuf/gdk-pixbuf.js";
import { libepoxyRecipe } from "../libepoxy/libepoxy.js";
import { atSpi2CoreRecipe } from "../at-spi2-core/at-spi2-core.js";
import { harfbuzzRecipe } from "../harfbuzz/harfbuzz.js";
import { fontconfigRecipe } from "../fontconfig/fontconfig.js";
import { freetypeRecipe } from "../freetype/freetype.js";
import { fribidiRecipe } from "../fribidi/fribidi.js";
import { libpngRecipe } from "../libpng/libpng.js";
import { pixmanRecipe } from "../pixman/pixman.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { expatRecipe } from "../expat/expat.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { libX11Recipe } from "../libX11/libX11.js";
import { libXextRecipe } from "../libXext/libXext.js";
import { libXrenderRecipe } from "../libXrender/libXrender.js";
import { libXiRecipe } from "../libXi/libXi.js";
import { libXrandrRecipe } from "../libXrandr/libXrandr.js";
import { libXcursorRecipe } from "../libXcursor/libXcursor.js";
import { libXineramaRecipe } from "../libXinerama/libXinerama.js";
import { libXdamageRecipe } from "../libXdamage/libXdamage.js";
import { libXcompositeRecipe } from "../libXcomposite/libXcomposite.js";
import { libXfixesRecipe } from "../libXfixes/libXfixes.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { dbusRecipe } from "../dbus/dbus.js";
import { libxml2Recipe } from "../libxml2/libxml2.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { xzRecipe } from "../xz/xz.js";
import { libXtstRecipe } from "../libXtst/libXtst.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { sharedMimeInfoRecipe } from "../shared-mime-info/shared-mime-info.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";

export const geanyRuntimeDeps = [...gtk3RuntimeDeps, "gtk3"].sort();

const recipe = await shellBuild({
  ...cProfile({
    cxx: true,
    // GTK3's .pc files reference all transitive deps, so pkg-config
    // needs to find them all.
    pkgConfigDeps: [
      "gtk3",
      "glib", "pango", "cairo", "gdk-pixbuf", "libepoxy",
      "at-spi2-core", "dbus",
      "harfbuzz", "fontconfig", "freetype", "fribidi", "libpng", "pixman",
      "zlib", "expat", "bzip2", "libffi", "pcre2",
      "libX11", "libXext", "libXrender", "libXi", "libXrandr",
      "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
      "libXfixes", "libXau", "libXcb", "libXdmcp",
      "libxml2", "libXtst", "xz",
    ],
    // TODO: pkgConfigPaths no longer needed — cProfile() now auto-includes
    // both lib/pkgconfig and share/pkgconfig for each pkgConfigDeps entry.
    // Add "xorgproto", "shared-mime-info" to pkgConfigDeps and remove this block.
    pkgConfigPaths: [
      "/deps/xorgproto/share/pkgconfig",
      "/deps/shared-mime-info/share/pkgconfig",
    ],
    binDeps: ["glib"],
  }),
  sourceDir: true,
  script: `
# Patch utils_resource_dir() to detect the install prefix at runtime on
# Linux. Geany hardcodes GEANY_DATADIR/LIBDIR/LOCALEDIR at compile time
# for the Linux code path (unlike macOS/Windows which use runtime APIs).
# Replace the Linux else-branch (lines 2356-2361 of src/utils.c) to
# resolve the prefix from /proc/self/exe instead of using compiled-in
# constants. This makes the binary work at any filesystem location.
#
# Use head/tail/heredoc to splice the replacement — avoids fragile sed
# escaping for multiline C code with tabs and quotes.
cat > /tmp/geany_prefix_patch.c << 'ENDPATCH'
			/* Resolve prefix from /proc/self/exe for relocatable installs */
			gchar *exe = realpath("/proc/self/exe", NULL);
			gchar *bindir = g_path_get_dirname(exe);
			g_free(exe);
			gchar *prefix = g_path_get_dirname(bindir);
			g_free(bindir);
			resdirs[RESOURCE_DIR_DATA] = g_build_filename(prefix, "share", "geany", NULL);
			resdirs[RESOURCE_DIR_ICON] = g_build_filename(prefix, "share", "icons", NULL);
			resdirs[RESOURCE_DIR_DOC] = g_build_filename(prefix, "share", "doc", "geany", "html", NULL);
			resdirs[RESOURCE_DIR_LOCALE] = g_build_filename(prefix, "share", "locale", NULL);
			resdirs[RESOURCE_DIR_PLUGIN] = g_build_filename(prefix, "lib", "geany", NULL);
			resdirs[RESOURCE_DIR_LIBEXEC] = g_build_filename(prefix, "libexec", "geany", NULL);
			g_free(prefix);
ENDPATCH
head -n 2355 src/utils.c > src/utils.c.new
cat /tmp/geany_prefix_patch.c >> src/utils.c.new
tail -n +2362 src/utils.c >> src/utils.c.new
mv src/utils.c.new src/utils.c

# Set up LD_LIBRARY_PATH and LDFLAGS for the full transitive dep chain
# so configure test compilations and the final link succeed.
export LD_LIBRARY_PATH="/deps/gtk3/lib:/deps/glib/lib:/deps/pango/lib:/deps/cairo/lib:/deps/gdk-pixbuf/lib:/deps/at-spi2-core/lib:/deps/libepoxy/lib:/deps/harfbuzz/lib:/deps/fontconfig/lib:/deps/freetype/lib:/deps/fribidi/lib:/deps/libpng/lib:/deps/pixman/lib:/deps/zlib/lib:/deps/expat/lib:/deps/bzip2/lib:/deps/libffi/lib:/deps/pcre2/lib:/deps/libX11/lib:/deps/libXext/lib:/deps/libXrender/lib:/deps/libXi/lib:/deps/libXrandr/lib:/deps/libXcursor/lib:/deps/libXinerama/lib:/deps/libXdamage/lib:/deps/libXcomposite/lib:/deps/libXfixes/lib:/deps/libXau/lib:/deps/libXcb/lib:/deps/libXdmcp/lib:/deps/dbus/lib:/deps/libxml2/lib:/deps/libiconv/lib:/deps/xz/lib:/deps/libXtst/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

export LDFLAGS="$HOD_DUMMY_RPATH \
  -L/deps/gtk3/lib \
  -L/deps/glib/lib -L/deps/pango/lib -L/deps/cairo/lib -L/deps/gdk-pixbuf/lib \
  -L/deps/at-spi2-core/lib -L/deps/libepoxy/lib -L/deps/harfbuzz/lib -L/deps/fontconfig/lib \
  -L/deps/freetype/lib -L/deps/fribidi/lib -L/deps/libpng/lib -L/deps/pixman/lib \
  -L/deps/zlib/lib -L/deps/expat/lib -L/deps/bzip2/lib -L/deps/libffi/lib -L/deps/pcre2/lib \
  -L/deps/libX11/lib -L/deps/libXext/lib -L/deps/libXrender/lib -L/deps/libXi/lib \
  -L/deps/libXrandr/lib -L/deps/libXcursor/lib -L/deps/libXinerama/lib \
  -L/deps/libXdamage/lib -L/deps/libXcomposite/lib -L/deps/libXfixes/lib \
  -L/deps/libXau/lib -L/deps/libXcb/lib -L/deps/libXdmcp/lib \
  -L/deps/dbus/lib -L/deps/libxml2/lib -L/deps/libiconv/lib -L/deps/xz/lib \
  -L/deps/libXtst/lib \
  -Wl,-rpath-link,/deps/gtk3/lib \
  -Wl,-rpath-link,/deps/glib/lib -Wl,-rpath-link,/deps/pango/lib \
  -Wl,-rpath-link,/deps/cairo/lib -Wl,-rpath-link,/deps/gdk-pixbuf/lib \
  -Wl,-rpath-link,/deps/at-spi2-core/lib -Wl,-rpath-link,/deps/libepoxy/lib \
  -Wl,-rpath-link,/deps/harfbuzz/lib -Wl,-rpath-link,/deps/fontconfig/lib \
  -Wl,-rpath-link,/deps/freetype/lib -Wl,-rpath-link,/deps/fribidi/lib \
  -Wl,-rpath-link,/deps/libpng/lib -Wl,-rpath-link,/deps/pixman/lib \
  -Wl,-rpath-link,/deps/zlib/lib -Wl,-rpath-link,/deps/expat/lib \
  -Wl,-rpath-link,/deps/bzip2/lib -Wl,-rpath-link,/deps/libffi/lib \
  -Wl,-rpath-link,/deps/pcre2/lib -Wl,-rpath-link,/deps/libX11/lib \
  -Wl,-rpath-link,/deps/libXext/lib -Wl,-rpath-link,/deps/libXrender/lib \
  -Wl,-rpath-link,/deps/libXi/lib -Wl,-rpath-link,/deps/libXrandr/lib \
  -Wl,-rpath-link,/deps/libXcursor/lib -Wl,-rpath-link,/deps/libXinerama/lib \
  -Wl,-rpath-link,/deps/libXdamage/lib -Wl,-rpath-link,/deps/libXcomposite/lib \
  -Wl,-rpath-link,/deps/libXfixes/lib -Wl,-rpath-link,/deps/libXau/lib \
  -Wl,-rpath-link,/deps/libXcb/lib -Wl,-rpath-link,/deps/libXdmcp/lib \
  -Wl,-rpath-link,/deps/dbus/lib -Wl,-rpath-link,/deps/libxml2/lib \
  -Wl,-rpath-link,/deps/libiconv/lib -Wl,-rpath-link,/deps/xz/lib \
  -Wl,-rpath-link,/deps/libXtst/lib"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-nls \\
  --disable-rpath \\
  --disable-dependency-tracking \\
  --disable-vte \\
  --enable-plugins \\
  --enable-socket \\
  --disable-html-docs \\
  --disable-pdf-docs \\
  --disable-api-docs \\
  --disable-gtkdoc-header

make -j$(nproc)

# geany.desktop generation requires intltool (unavailable with --disable-nls).
# Create it from the configure-processed .desktop.in file.
test -f geany.desktop || cp geany.desktop.in geany.desktop

make install DESTDIR=$OUT

# Strip binaries and libraries
${STRIP_BINARIES}

# Clean up
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", geanySourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("gtk3", gtk3Recipe),
    dep("glib", glibRecipe),
    dep("pango", pangoRecipe),
    dep("cairo", cairoRecipe),
    dep("gdk-pixbuf", gdkPixbufRecipe),
    dep("libepoxy", libepoxyRecipe),
    dep("at-spi2-core", atSpi2CoreRecipe),
    dep("harfbuzz", harfbuzzRecipe),
    dep("fontconfig", fontconfigRecipe),
    dep("freetype", freetypeRecipe),
    dep("fribidi", fribidiRecipe),
    dep("libpng", libpngRecipe),
    dep("pixman", pixmanRecipe),
    dep("zlib", zlibRecipe),
    dep("expat", expatRecipe),
    dep("bzip2", bzip2Recipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("libX11", libX11Recipe),
    dep("libXext", libXextRecipe),
    dep("libXrender", libXrenderRecipe),
    dep("libXi", libXiRecipe),
    dep("libXrandr", libXrandrRecipe),
    dep("libXcursor", libXcursorRecipe),
    dep("libXinerama", libXineramaRecipe),
    dep("libXdamage", libXdamageRecipe),
    dep("libXcomposite", libXcompositeRecipe),
    dep("libXfixes", libXfixesRecipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("dbus", dbusRecipe),
    dep("libxml2", libxml2Recipe),
    dep("libiconv", libiconvRecipe),
    dep("xz", xzRecipe),
    dep("libXtst", libXtstRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("shared-mime-info", sharedMimeInfoRecipe),
  ],
  runtime_deps: geanyRuntimeDeps,
});

await importToStore(recipe);
export const geanyRecipe = recipe;
