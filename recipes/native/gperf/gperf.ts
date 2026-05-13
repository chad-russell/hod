//! gperf build recipe — perfect hash function generator.
//!
//! Build tool needed by fontconfig.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { gperfSourceRecipe } from "./gperf-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"

./configure \
  --prefix=/ \
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info 2>/dev/null || true
`,
  deps: [
    dep("source", gperfSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const gperfRecipe = recipe;
