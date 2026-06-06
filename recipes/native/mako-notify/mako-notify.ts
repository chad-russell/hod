import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { makoNotifySourceRecipe } from "./mako-notify-source.js";
import { waylandRecipe, waylandRuntimeDeps } from "../wayland/wayland.js";
import { waylandProtocolsRecipe } from "../wayland-protocols/wayland-protocols.js";
import { cairoRecipe } from "../cairo/cairo.js";
import { pangoRecipe } from "../pango/pango.js";
import { glibRecipe, glibRuntimeDeps } from "../glib/glib.js";
import { gdkPixbufRecipe } from "../gdk-pixbuf/gdk-pixbuf.js";
import { basuRecipe } from "../basu/basu.js";
import { expatRecipe } from "../expat/expat.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { libpngRecipe, libpngRuntimeDeps } from "../libpng/libpng.js";
import { pixmanRecipe, pixmanRuntimeDeps } from "../pixman/pixman.js";
import { harfbuzzRecipe } from "../harfbuzz/harfbuzz.js";
import { fontconfigRecipe } from "../fontconfig/fontconfig.js";
import { freetypeRecipe } from "../freetype/freetype.js";
import { fribidiRecipe } from "../fribidi/fribidi.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { libX11Recipe } from "../libX11/libX11.js";
import { libXextRecipe } from "../libXext/libXext.js";
import { libXrenderRecipe } from "../libXrender/libXrender.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...mesonProfile({
    binDeps: ["wayland"],
    includeDeps: [
      "wayland", "cairo", "pango", "glib", "gdk-pixbuf", "basu",
      "expat", "libffi", "zlib", "pcre2", "libpng", "pixman",
      "harfbuzz", "fontconfig", "freetype", "fribidi",
      "bzip2", "libX11", "libXext", "libXrender", "libXau", "libXcb", "libXdmcp",
    ],
    libDeps: [
      "wayland", "cairo", "pango", "glib", "gdk-pixbuf", "basu",
      "expat", "libffi", "zlib", "pcre2", "libpng", "pixman",
      "harfbuzz", "fontconfig", "freetype", "fribidi",
      "bzip2", "libX11", "libXext", "libXrender", "libXau", "libXcb", "libXdmcp",
    ],
    pkgConfigDeps: [
      "wayland", "wayland-protocols", "cairo", "pango", "glib",
      "gdk-pixbuf", "basu", "expat", "libffi", "zlib", "pcre2",
      "libpng", "pixman", "harfbuzz", "fontconfig", "freetype", "fribidi",
      "bzip2", "libX11", "libXext", "libXrender", "libXau", "libXcb", "libXdmcp",
    ],
    pkgConfigPaths: [
      "/deps/wayland-protocols/share/pkgconfig",
      "/deps/xorgproto/share/pkgconfig",
    ],
  }),
  sourceDir: true,
  script: `
export LD_LIBRARY_PATH="/deps/wayland/lib:/deps/cairo/lib:/deps/pango/lib:/deps/glib/lib:/deps/gdk-pixbuf/lib:/deps/basu/lib:/deps/expat/lib:/deps/libffi/lib:/deps/zlib/lib:/deps/pcre2/lib:/deps/libpng/lib:/deps/pixman/lib:/deps/harfbuzz/lib:/deps/fontconfig/lib:/deps/freetype/lib:/deps/fribidi/lib:/deps/bzip2/lib:/deps/libX11/lib:/deps/libXext/lib:/deps/libXrender/lib:/deps/libXau/lib:/deps/libXcb/lib:/deps/libXdmcp/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export PATH="/deps/wayland/bin:$PATH"

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Dsd-bus-provider=basu \\
  -Dicons=disabled \\
  -Dman-pages=disabled \\
  -Dfish-completions=false \\
  -Dzsh-completions=false \\
  -Dbash-completions=false

ninja -C build
DESTDIR=$OUT ninja -C build install

${STRIP_BINARIES}

rm -rf $OUT/share/doc $OUT/share/man 2>/dev/null || true
`,
  deps: [
    dep("source", makoNotifySourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("wayland", waylandRecipe),
    dep("wayland-protocols", waylandProtocolsRecipe),
    dep("cairo", cairoRecipe),
    dep("pango", pangoRecipe),
    dep("glib", glibRecipe),
    dep("gdk-pixbuf", gdkPixbufRecipe),
    dep("basu", basuRecipe),
    dep("expat", expatRecipe),
    dep("libffi", libffiRecipe),
    dep("zlib", zlibRecipe),
    dep("pcre2", pcre2Recipe),
    dep("libpng", libpngRecipe),
    dep("pixman", pixmanRecipe),
    dep("harfbuzz", harfbuzzRecipe),
    dep("fontconfig", fontconfigRecipe),
    dep("freetype", freetypeRecipe),
    dep("fribidi", fribidiRecipe),
    dep("bzip2", bzip2Recipe),
    dep("libX11", libX11Recipe),
    dep("libXext", libXextRecipe),
    dep("libXrender", libXrenderRecipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: [...new Set([
    ...waylandRuntimeDeps,
    ...glibRuntimeDeps,
    ...pixmanRuntimeDeps,
    ...libpngRuntimeDeps,
    "basu", "cairo", "expat", "fontconfig", "freetype",
    "fribidi", "gdk-pixbuf", "harfbuzz", "pango", "pcre2",
  ])].sort(),
});

await importToStore(recipe);
export const makoNotifyRecipe = recipe;
