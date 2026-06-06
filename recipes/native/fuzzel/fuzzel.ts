import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { fuzzelSourceRecipe } from "./fuzzel-source.js";
import { waylandRecipe, waylandRuntimeDeps } from "../wayland/wayland.js";
import { waylandProtocolsRecipe } from "../wayland-protocols/wayland-protocols.js";
import { expatRecipe } from "../expat/expat.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { pixmanRecipe, pixmanRuntimeDeps } from "../pixman/pixman.js";
import { libpngRecipe, libpngRuntimeDeps } from "../libpng/libpng.js";
import { fontconfigRecipe } from "../fontconfig/fontconfig.js";
import { freetypeRecipe } from "../freetype/freetype.js";
import { harfbuzzRecipe } from "../harfbuzz/harfbuzz.js";
import { libxkbcommonRecipe } from "../libxkbcommon/libxkbcommon.js";
import { tllistRecipe } from "../tllist/tllist.js";
import { fcftRecipe } from "../fcft/fcft.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...mesonProfile({
    binDeps: ["wayland"],
    includeDeps: [
      "wayland", "pixman", "libpng", "fontconfig", "freetype",
      "harfbuzz", "libxkbcommon", "tllist", "fcft", "bzip2",
    ],
    libDeps: [
      "wayland", "pixman", "libpng", "fontconfig", "freetype",
      "harfbuzz", "libxkbcommon", "tllist", "fcft", "expat", "libffi", "zlib", "bzip2",
    ],
    pkgConfigDeps: [
      "wayland", "wayland-protocols", "pixman", "libpng",
      "fontconfig", "freetype", "harfbuzz", "libxkbcommon",
      "tllist", "fcft", "expat", "libffi", "zlib", "bzip2",
    ],
    pkgConfigPaths: ["/deps/wayland-protocols/share/pkgconfig"],
  }),
  sourceDir: true,
  script: `
export LD_LIBRARY_PATH="/deps/expat/lib:/deps/wayland/lib:/deps/zlib/lib:/deps/pixman/lib:/deps/libpng/lib:/deps/fontconfig/lib:/deps/freetype/lib:/deps/harfbuzz/lib:/deps/libxkbcommon/lib:/deps/libffi/lib:/deps/tllist/lib:/deps/fcft/lib:/deps/bzip2/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export PATH="/deps/wayland/bin:$PATH"
export CPPFLAGS="-I/deps/freetype/include/freetype2"

sed -i "/subdir('doc')/d" meson.build

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Dpng-backend=libpng \\
  -Dsvg-backend=nanosvg

ninja -C build
DESTDIR=$OUT ninja -C build install

${STRIP_BINARIES}

rm -rf $OUT/share/doc $OUT/share/man 2>/dev/null || true
`,
  deps: [
    dep("source", fuzzelSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("wayland", waylandRecipe),
    dep("wayland-protocols", waylandProtocolsRecipe),
    dep("expat", expatRecipe),
    dep("libffi", libffiRecipe),
    dep("zlib", zlibRecipe),
    dep("pixman", pixmanRecipe),
    dep("libpng", libpngRecipe),
    dep("fontconfig", fontconfigRecipe),
    dep("freetype", freetypeRecipe),
    dep("harfbuzz", harfbuzzRecipe),
    dep("libxkbcommon", libxkbcommonRecipe),
    dep("tllist", tllistRecipe),
    dep("fcft", fcftRecipe),
    dep("bzip2", bzip2Recipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: [...new Set([
    ...waylandRuntimeDeps,
    ...pixmanRuntimeDeps,
    ...libpngRuntimeDeps,
    "expat", "fcft", "fontconfig", "freetype", "harfbuzz",
    "libffi", "libxkbcommon", "tllist",
  ])].sort(),
});

await importToStore(recipe);
export const fuzzelRecipe = recipe;
