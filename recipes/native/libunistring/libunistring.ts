//! libunistring build recipe — Unicode string library for C.
//!
//! Builds libunistring 1.3. No external dependencies beyond the toolchain.
//! Required by tinysparql for Unicode support.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libunistringSourceRecipe } from "./libunistring-source.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const libunistringRuntimeDeps = ["libiconv", "toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["libiconv"],
    libDeps: ["libiconv"],
  }),
  sourceDir: true,
  script: `
./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-rpath

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", libunistringSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("libiconv", libiconvRecipe),
  ],
  runtime_deps: libunistringRuntimeDeps,
});

await importToStore(recipe);
export const libunistringRecipe = recipe;
