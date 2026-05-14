//! nghttp2 build recipe — HTTP/2 C library.
//!
//! Builds nghttp2 1.69.0 (library only, no command-line tools).
//! Dependencies: toolchain only. Required by libsoup3.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { nghttp2SourceRecipe } from "./nghttp2-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# Need CXX even though we only build the C library (configure checks for it)
export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"

# Build only the library, not the full application suite
./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --enable-lib-only \\
  --disable-python-bindings \\
  --disable-examples \\
  --disable-app \\
  --disable-hpack-tools \\
  --disable-assert \\
  --without-jemalloc \\
  --without-libxml2 \\
  --without-neverbleed

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
    dep("source", nghttp2SourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const nghttp2Recipe = recipe;
