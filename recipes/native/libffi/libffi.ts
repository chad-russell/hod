//! libffi native build recipe — portable foreign-function interface library.
//!
//! Builds libffi 3.4.8 with shared + static library output using the native
//! toolchain. libffi provides a portable FFI layer required by Python's ctypes
//! module, as well as many other language runtimes and JIT compilers.
//!
//! No dependencies beyond the toolchain. Dynamically links glibc from the
//! toolchain (relocated via runtime_deps).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libffiSourceRecipe } from "./libffi-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# libffi's configure checks for a C++ compiler and preprocessor.
# The toolchain has g++ but it's not fully functional. Use gcc -E as the
# C++ preprocessor to pass the sanity check; the C++ support is only used
# for optional ffi_call tests which we don't need.
export CXXCPP="/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin -E"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --enable-static \\
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

# Ensure the static library archive is properly indexed
/deps/toolchain/bin/ranlib $OUT/lib/libffi.a 2>/dev/null || true

# Strip shared library
/deps/toolchain/bin/strip $OUT/lib/libffi.so.*.*.* 2>/dev/null || true

# Clean up — keep lib/pkgconfig and headers for downstream deps
rm -rf $OUT/share/info $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
rmdir $OUT/share 2>/dev/null || true
`,
  deps: [
    dep("source", libffiSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const libffiRecipe = recipe;
