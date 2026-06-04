//! cbonsai native build recipe — terminal bonsai tree generator.
//!
//! Builds cbonsai v1.4.2 linked against shared ncurses. Dynamically links
//! glibc from the toolchain (relocated via runtime_deps).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { ncursesRecipe } from "../ncurses/ncurses.js";
import { cbonsaiSourceRecipe } from "./cbonsai-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["ncurses"],
    includePaths: ["/deps/ncurses/include/ncursesw"],
    libDeps: ["ncurses"],
  }),
  sourceDir: true,
  script: `
make cbonsai \\
  CC="/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin" \\
  CFLAGS="-O2 -I/deps/ncurses/include -I/deps/ncurses/include/ncursesw" \\
  LDFLAGS="$HOD_DUMMY_RPATH -L/deps/ncurses/lib" \\
  LDLIBS="-lpanelw -lncursesw"

mkdir -p $OUT/bin
cp cbonsai $OUT/bin/cbonsai
chmod +x $OUT/bin/cbonsai

${STRIP_BINARIES}`,
  deps: [
    dep("ncurses", ncursesRecipe),
    dep("source", cbonsaiSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["ncurses", "toolchain"],
});

await importToStore(recipe);
export const cbonsaiRecipe = recipe;
