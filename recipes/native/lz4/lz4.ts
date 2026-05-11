//! lz4 native build recipe — extremely fast compression library.
//!
//! Builds LZ4 1.10.0. Standalone, zero deps beyond toolchain.
//! Produces liblz4.so, lz4 CLI. Needed by libarchive, cURL, and many
//! modern packages.
//!
//! Uses LZ4's own Makefile build system. Dynamically links glibc
//! (relocated via runtime_deps).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { lz4SourceRecipe } from "./lz4-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# Build shared library and CLI
make -j$(nproc) -C lib lib-release LIB_TYPE=dynamic
make -j$(nproc) -C programs lz4-release

# Install library
make -C lib install DESTDIR=$OUT PREFIX=/ LIB_TYPE=dynamic

# Install CLI
make -C programs install DESTDIR=$OUT PREFIX=/

# Make pkg-config files relocatable via pcfiledir (pkgconf extension).
for pc in $OUT/lib/pkgconfig/*.pc $OUT/lib64/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */lib64/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../../..|' "$pc" ;;
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

# Strip binaries and shared library
find $OUT/bin -type f -exec $STRIP {} + 2>/dev/null || true
$STRIP $OUT/lib/liblz4.so.*.*.* 2>/dev/null || true

# Fix absolute symlinks — replace with relative
cd $OUT/bin
ln -sf lz4 lz4c
ln -sf lz4 lz4cat
ln -sf lz4 unlz4

# Clean up — remove docs, man, la files. Keep pkgconfig.
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true

# Verify key outputs
ls -la $OUT/bin/lz4
ls -la $OUT/lib/liblz4.so
`,
  deps: [
    dep("source", lz4SourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const lz4Recipe = recipe;
