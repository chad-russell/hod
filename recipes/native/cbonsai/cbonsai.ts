//! cbonsai native build recipe — built with the native toolchain.
import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { ncursesRecipe } from "../ncurses/ncurses.js";
import { cbonsaiSourceRecipe } from "./cbonsai-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

tar xf /deps/source/source -C /tmp
cd /tmp/cbonsai-v1.4.2

export PATH=/deps/toolchain/bin

make cbonsai \\
  CC="/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin" \\
  CFLAGS="-O2 -I/deps/ncurses/include -I/deps/ncurses/include/ncursesw" \\
  LDFLAGS="-static -L/deps/ncurses/lib" \\
  LDLIBS="-lpanelw -lncursesw"

mkdir -p $OUT/bin
cp cbonsai $OUT/bin/cbonsai
chmod +x $OUT/bin/cbonsai`,
  deps: [
    dep("ncurses", ncursesRecipe),
    dep("source", cbonsaiSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
});

await importToStore(recipe);
export const cbonsaiRecipe = recipe;
