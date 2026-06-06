import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { fcftSourceRecipe } from "./fcft-source.js";
import { tllistRecipe } from "../tllist/tllist.js";
import { fontconfigRecipe } from "../fontconfig/fontconfig.js";
import { freetypeRecipe } from "../freetype/freetype.js";
import { harfbuzzRecipe } from "../harfbuzz/harfbuzz.js";
import { pixmanRecipe } from "../pixman/pixman.js";
import { expatRecipe } from "../expat/expat.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { libpngRecipe } from "../libpng/libpng.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_LIBRARIES, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    includeDeps: ["tllist", "fontconfig", "freetype", "harfbuzz", "pixman"],
    libDeps: ["tllist", "fontconfig", "freetype", "harfbuzz", "pixman", "expat", "libffi", "zlib", "libpng", "bzip2"],
    pkgConfigDeps: ["tllist", "fontconfig", "freetype", "harfbuzz", "pixman", "expat", "libffi", "zlib", "libpng", "bzip2"],
  }),
  sourceDir: true,
  script: `
export LD_LIBRARY_PATH="/deps/pixman/lib:/deps/fontconfig/lib:/deps/freetype/lib:/deps/harfbuzz/lib:/deps/expat/lib:/deps/libffi/lib:/deps/zlib/lib:/deps/libpng/lib:/deps/bzip2/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export CPPFLAGS="-I/deps/freetype/include/freetype2"
export LDFLAGS="$HOD_DUMMY_RPATH -Wl,-rpath-link,/deps/pixman/lib -Wl,-rpath-link,/deps/fontconfig/lib -Wl,-rpath-link,/deps/freetype/lib -Wl,-rpath-link,/deps/harfbuzz/lib -Wl,-rpath-link,/deps/expat/lib -Wl,-rpath-link,/deps/zlib/lib"

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddocs=disabled \\
  -Dexamples=false

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_LIBRARIES}
`,
  deps: [
    dep("source", fcftSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("tllist", tllistRecipe),
    dep("fontconfig", fontconfigRecipe),
    dep("freetype", freetypeRecipe),
    dep("harfbuzz", harfbuzzRecipe),
    dep("pixman", pixmanRecipe),
    dep("expat", expatRecipe),
    dep("libffi", libffiRecipe),
    dep("zlib", zlibRecipe),
    dep("libpng", libpngRecipe),
    dep("bzip2", bzip2Recipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: ["expat", "fontconfig", "freetype", "harfbuzz", "libffi", "libpng", "pixman", "tllist", "toolchain", "zlib"],
});

await importToStore(recipe);
export const fcftRecipe = recipe;
