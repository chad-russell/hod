//! libidn2 build recipe — Internationalized domain names library.
//!
//! Builds libidn2 2.3.7 with libunistring support.
//! Dependencies: libunistring, libiconv, toolchain.
//! Required by libpsl.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libidn2SourceRecipe } from "./libidn2-source.js";
import { libunistringRecipe } from "../libunistring/libunistring.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL } from "../../helpers/strip.js";

export const libidn2RuntimeDeps = ["libiconv", "libunistring", "toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["libunistring", "libiconv"],
    libDeps: ["libunistring", "libiconv"],
    pkgConfigDeps: ["libunistring", "libiconv"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

export LD_LIBRARY_PATH="/deps/libunistring/lib:/deps/libiconv/lib"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --with-libunistring-prefix=/deps/libunistring \\
  --disable-doc \\
  --disable-gtk-doc

make -j$(nproc)
make install DESTDIR=$OUT

# Make pkg-config files relocatable.
for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\\\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\\\${pcfiledir}/../..|' "$pc" ;;
  esac
done

${STRIP_ALL}
`,
  deps: [
    dep("source", libidn2SourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("libunistring", libunistringRecipe),
    dep("libiconv", libiconvRecipe),
  ],
  runtime_deps: libidn2RuntimeDeps,
});

await importToStore(recipe);
export const libidn2Recipe = recipe;
