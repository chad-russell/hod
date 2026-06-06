import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libsndfileSourceRecipe } from "./libsndfile-source.js";
import { cProfile } from "../../helpers/c.js";
import { pythonRecipe } from "../python/python.js";
import { STRIP_LIBRARIES, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile({
    binDeps: ["python"],
  }),
  sourceDir: true,
  script: `
export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export CXXFLAGS="-O2"
export PYTHON="python3"

./configure \\
  --prefix=/ \\
  --libdir=/lib \\
  --enable-shared \\
  --disable-static \\
  --disable-external-libs \\
  --disable-sqlite \\
  --disable-dependency-tracking \\
  --disable-sqlite \\
  --disable-full-suite

  make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_LIBRARIES}
rm -rf $OUT/share/doc $OUT/share/man 2>/dev/null || true
`,
  deps: [
    dep("source", libsndfileSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const libsndfileRecipe = recipe;
