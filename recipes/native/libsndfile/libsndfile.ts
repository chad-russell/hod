import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libsndfileSourceRecipe } from "./libsndfile-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_LIBRARIES, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `
./configure \\
  --prefix=/ \\
  --libdir=/lib \\
  --enable-shared \\
  --disable-static \\
  --disable-external-libs \\
  --disable-sqlite \\
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_LIBRARIES}
rm -rf $OUT/share/doc $OUT/share/man 2>/dev/null || true
`,
  deps: [
    dep("source", libsndfileSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const libsndfileRecipe = recipe;
