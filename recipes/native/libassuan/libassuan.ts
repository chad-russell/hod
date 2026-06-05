//! libassuan build recipe — IPC library for GnuPG components.
//!
//! Builds libassuan 3.0.2. Provides libassuan.so and libassuan-config.
//! Required by gpgme for communication with GnuPG agents.
//!
//! Dependencies:
//!   - libgpg-error (error codes and config tools)
//!   - toolchain (gcc, glibc, etc.)

import { shellBuild, dep, importToStore, depSubpath, pathList } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libgpgErrorRecipe } from "../libgpg-error/libgpg-error.js";
import { libassuanSourceRecipe } from "./libassuan-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL } from "../../helpers/strip.js";

export const libassuanRuntimeDeps = ["libgpg-error", "toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["libgpg-error"],
    libDeps: ["libgpg-error"],
  }),
  sourceDir: true,
  script: `
export PATH="${depSubpath("libgpg-error", "bin")}:\${PATH}"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static

make -j$(nproc)
make install DESTDIR=$OUT

${STRIP_ALL}
rm -rf $OUT/share/man $OUT/share/info
`,
  deps: [
    dep("source", libassuanSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("libgpg-error", libgpgErrorRecipe),
  ],
  runtime_deps: libassuanRuntimeDeps,
});

await importToStore(recipe);
export const libassuanRecipe = recipe;
