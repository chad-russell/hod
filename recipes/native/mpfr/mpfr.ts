//! MPFR native build recipe — GNU Multiple-precision floating-point reliable library.
//!
//! Builds MPFR 4.2.2 with shared + static library output. MPFR provides
//! correct rounding for multiple-precision floating-point arithmetic.
//! Required by GDB (mandatory dependency).
//!
//! Dependencies:
//!   - GMP (arbitrary-precision arithmetic, shared lib)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { gmpRecipe } from "../gmp/gmp.js";
import { mpfrSourceRecipe } from "./mpfr-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["gmp"],
    libDeps: ["gmp"],
    pkgConfigDeps: ["gmp"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

export LDFLAGS="$HOD_DUMMY_RPATH"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --enable-static \\
  --disable-dependency-tracking \\
  --with-gmp=/deps/gmp

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

# Strip shared libraries
find $OUT/lib -name 'lib*.so.*' -type f -exec /deps/toolchain/bin/strip --strip-unneeded {} + 2>/dev/null || true

# Clean up — keep lib/pkgconfig and headers for downstream deps (GDB)
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true
rmdir $OUT/share 2>/dev/null || true
`,
  deps: [
    dep("source", mpfrSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("gmp", gmpRecipe),
  ],
  runtime_deps: ["gmp", "toolchain"],
});

await importToStore(recipe);
export const mpfrRecipe = recipe;
