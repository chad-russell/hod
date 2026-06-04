//! json-c native build recipe — JSON manipulation library.
//!
//! Builds json-c 0.18 with shared library output using CMake.
//! No dependencies beyond the toolchain and cmake. Needed by crun 1.28+.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { cmakeRecipe } from "../cmake/cmake.js";
import { jsonCSourceRecipe } from "./json-c-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL } from "../../helpers/strip.js";

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
chmod +x /tmp/cmake-bin/cc

cmake -S /tmp/build -B /tmp/build-dir \\
  -DCMAKE_INSTALL_PREFIX=/ \\
  -DCMAKE_INSTALL_LIBDIR=lib \\
  -DCMAKE_BUILD_TYPE=Release \\
  -DCMAKE_C_COMPILER=/tmp/cmake-bin/cc \\
  -DBUILD_SHARED_LIBS=ON \\
  -DBUILD_STATIC_LIBS=OFF \\
  -DENABLE_BUILD_TESTS=OFF \\
  -DENABLE_BUILD_APP=OFF

cmake --build /tmp/build-dir -j$(nproc)
DESTDIR=$OUT cmake --install /tmp/build-dir

if [ -d $OUT/usr ]; then
  cp -a $OUT/usr/. $OUT/
  rm -rf $OUT/usr
fi

${STRIP_ALL}
rm -rf $OUT/lib/cmake $OUT/share/doc 2>/dev/null || true
`,
  deps: [
    dep("source", jsonCSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("cmake", cmakeRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const jsonCRecipe = recipe;
