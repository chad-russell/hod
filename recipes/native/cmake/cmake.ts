//! CMake build recipe.
//!
//! Builds CMake from source using CMake's own `bootstrap` script, so we do not
//! need a pre-existing host CMake. This is the first missing build tool needed
//! for a source-built minimal LLVM/Clang bindgen path.
//!
//! Hermeticity goals:
//!   - no host `/usr/bin/cmake`
//!   - no host package manager dependencies
//!   - all compilation via the Hod toolchain
//!   - bundled third-party libraries by default (`--no-system-libs`)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { cmakeSourceRecipe } from "./cmake-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `
cp -a /deps/source/. /tmp/build
cd /tmp/build

# shellBuild sets CC, but CMake bootstrap also needs a matching C++ compiler.
export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export CFLAGS="-O2"
export CXXFLAGS="-O2"

# Build CMake using the shipped bootstrap path so no host cmake is required.
./bootstrap \
  --prefix=/ \
  --parallel=$(nproc) \
  --no-qt-gui \
  --no-system-libs \
  -- \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_USE_OPENSSL=OFF

make -j$(nproc)
DESTDIR=$OUT make install

find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
rm -rf $OUT/share/doc $OUT/share/man $OUT/doc 2>/dev/null || true

echo "=== cmake version ==="
$OUT/bin/cmake --version
echo "=== ctest version ==="
$OUT/bin/ctest --version
echo "=== CMake installation complete ==="
`,
  deps: [
    dep("source", cmakeSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const cmakeRecipe = recipe;
