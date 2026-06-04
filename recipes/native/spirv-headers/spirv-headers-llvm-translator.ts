//! SPIRV-Headers pinned for SPIRV-LLVM-Translator 22.1.0.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { cProfile } from "../../helpers/c.js";
import { cmakeRecipe } from "../cmake/cmake.js";
import { spirvHeadersLlvmTranslatorSourceRecipe } from "./spirv-headers-llvm-translator-source.js";

const recipe = await shellBuild({
  ...cProfile({
    binDeps: ["cmake"],
  }),
  sourceDir: true,
  script: `

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

cmake -S /tmp/build -B /tmp/build-dir \
  -DCMAKE_INSTALL_PREFIX=/ \
  -DCMAKE_INSTALL_INCLUDEDIR=include \
  -DCMAKE_INSTALL_DATADIR=share \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_COMPILER=/tmp/cmake-bin/cc \
  -DCMAKE_CXX_COMPILER=/tmp/cmake-bin/cxx \
  -DSPIRV_HEADERS_ENABLE_TESTS=OFF

DESTDIR=$OUT cmake --install /tmp/build-dir

if [ -d $OUT/usr ]; then
  cp -a $OUT/usr/. $OUT/
  rm -rf $OUT/usr
fi

echo "=== SPIRV-Headers translator install ==="
ls $OUT/include/spirv/unified1/spirv.core.grammar.json
ls $OUT/share/cmake/SPIRV-Headers/SPIRV-HeadersConfig.cmake
echo "=== SPIRV-Headers translator complete ==="
`,
  deps: [
    dep("source", spirvHeadersLlvmTranslatorSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("cmake", cmakeRecipe),
  ],
});

await importToStore(recipe);
export const spirvHeadersLlvmTranslatorRecipe = recipe;
