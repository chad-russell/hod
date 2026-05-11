//! expat native build recipe — stream-oriented C XML parser library.
//!
//! Builds expat 2.7.1 with shared + static library output. Standalone build
//! (no dependencies beyond toolchain). Provides libexpat needed by git (HTTP),
//! dbus, fontconfig, etc. Dynamically links glibc (relocated via runtime_deps).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { expatSourceRecipe } from "./expat-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export CXXCPP="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin -E"
./configure \
  --prefix=/ \
  --enable-shared \
  --enable-static \
  --without-docbook \
  --without-examples \
  --without-tests \
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

# Make pkg-config files relocatable via pcfiledir (pkgconf extension).
for pc in $OUT/lib/pkgconfig/*.pc $OUT/lib64/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */lib64/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../../..|' "$pc" ;;
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

# Strip the xmlwf binary and shared library
/deps/toolchain/bin/strip $OUT/bin/xmlwf 2>/dev/null || true
/deps/toolchain/bin/strip $OUT/lib/libexpat.so.*.*.* 2>/dev/null || true

# Clean up — keep lib/pkgconfig for downstream deps
rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la $OUT/lib/cmake 2>/dev/null || true
rmdir $OUT/share 2>/dev/null || true
`,
  deps: [
    dep("source", expatSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const expatRecipe = recipe;
