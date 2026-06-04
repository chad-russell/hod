import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { alsaLibSourceRecipe } from "./alsa-lib-source.js";
import { cProfile } from "../../helpers/c.js";
import { RELOCATE_PKG_CONFIG, STRIP_LIBRARIES } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `
./configure \\
  --prefix=/ \\
  --libdir=/lib \\
  --enable-shared \\
  --disable-static \\
  --disable-python \\
  --disable-old-symbols \\
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_LIBRARIES}
rm -rf $OUT/share/aclocal $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", alsaLibSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const alsaLibRecipe = recipe;
