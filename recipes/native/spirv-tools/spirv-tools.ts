//! SPIRV-Tools Vulkan SDK 1.4.321.0.
//!
//! Provides `spirv-link`, required by clang's SPIR-V backend when building
//! libclc's Mesa SPIR-V builtins.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { cProfile } from "../../helpers/c.js";
import { cmakeRecipe } from "../cmake/cmake.js";
import { expatRecipe } from "../expat/expat.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { spirvHeadersRecipe } from "../spirv-headers/spirv-headers.js";
import { spirvToolsSourceRecipe } from "./spirv-tools-source.js";

const recipe = await shellBuild({
  ...cProfile({
    binDeps: ["cmake", "ninja", "python"],
  }),
  script: `
cp -a /deps/source/. /tmp/build

export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export CFLAGS="-O2"
export CXXFLAGS="-O2"

mkdir -p /tmp/cmake-bin
cat > /tmp/cmake-bin/cc << 'EOF'
#!/bin/sh
exec /deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin "$@"
EOF
cat > /tmp/cmake-bin/cxx << 'EOF'
#!/bin/sh
exec /deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin "$@"
EOF
chmod +x /tmp/cmake-bin/cc /tmp/cmake-bin/cxx

cmake -G Ninja \
  -S /tmp/build \
  -B /tmp/build-dir \
  -DCMAKE_INSTALL_PREFIX=/ \
  -DCMAKE_INSTALL_BINDIR=bin \
  -DCMAKE_INSTALL_INCLUDEDIR=include \
  -DCMAKE_INSTALL_LIBDIR=lib \
  -DCMAKE_INSTALL_DATADIR=share \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_COMPILER=/tmp/cmake-bin/cc \
  -DCMAKE_CXX_COMPILER=/tmp/cmake-bin/cxx \
  -DPython3_EXECUTABLE=/deps/python/bin/python3 \
  -DCMAKE_PREFIX_PATH=/deps/spirv-headers \
  -DSPIRV-Headers_SOURCE_DIR=/deps/spirv-headers \
  -DSPIRV_SKIP_TESTS=ON \
  -DSPIRV_WERROR=OFF \
  -DSPIRV_TOOLS_BUILD_STATIC=ON

ninja -C /tmp/build-dir spirv-link
DESTDIR=$OUT ninja -C /tmp/build-dir install

if [ -d $OUT/usr ]; then
  cp -a $OUT/usr/. $OUT/
  rm -rf $OUT/usr
fi

for pc in $OUT/lib/pkgconfig/SPIRV-Tools*.pc; do
  [ -f "$pc" ] || continue
  sed -i 's|^prefix=.*|prefix=/deps/spirv-tools|' "$pc"
  sed -i 's|^libdir=.*|libdir=\${prefix}/lib|' "$pc"
  sed -i 's|^includedir=.*|includedir=\${prefix}/include|' "$pc"
done

echo "=== SPIRV-Tools binaries ==="
ls $OUT/bin/spirv-link
$OUT/bin/spirv-link --version || true
echo "=== SPIRV-Tools complete ==="
`,
  deps: [
    dep("source", spirvToolsSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("cmake", cmakeRecipe),
    dep("expat", expatRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
    dep("spirv-headers", spirvHeadersRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const spirvToolsRecipe = recipe;
