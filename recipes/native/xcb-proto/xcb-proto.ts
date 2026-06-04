//! xcb-proto build recipe — XCB protocol XML descriptions.
//!
//! Installs xcb-proto 1.17.0. Data-only package (XML files used by libxcb
//! to generate C code at build time). No shared libraries.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { xcbProtoSourceRecipe } from "./xcb-proto-source.js";
import { pythonRecipe } from "../python/python.js";
import { cProfile } from "../../helpers/c.js";
import { RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile({
    binDeps: ["python"],
  }),
  sourceDir: true,
  script: `

./configure --prefix=/

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

rm -rf $OUT/share/doc $OUT/share/man 2>/dev/null || true
`,
  deps: [
    dep("source", xcbProtoSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("python", pythonRecipe),
  ],
});

await importToStore(recipe);
export const xcbProtoRecipe = recipe;
