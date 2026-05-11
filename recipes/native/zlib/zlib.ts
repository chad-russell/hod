//! zlib native build recipe — shared + static library built with the native toolchain.
//!
//! Builds zlib 1.3.1 with shared library output (libz.so*) and static library.
//! Shared libraries use store-relative RUNPATH via runtime_deps for glibc.
//! Downstream packages link against the shared lib via pkg-config.
import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { zlibSourceRecipe } from "./zlib-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# Build shared + static (zlib's configure enables both by default without --static)
./configure --prefix=/

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

# Strip shared library and static archive
/deps/toolchain/bin/strip $OUT/lib/libz.so.*.*.* 2>/dev/null || true

# Clean up — keep lib/pkgconfig, headers, .so symlinks, .a for downstream
rm -rf $OUT/share $OUT/lib/*.la 2>/dev/null || true`,
  deps: [
    dep("source", zlibSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const zlibRecipe = recipe;
