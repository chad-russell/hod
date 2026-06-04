//! libxshmfence — shared memory fences for DRI3.
//!
//! Small X11 extension library needed by Mesa's DRI3 implementation.
//! autotools build. No significant runtime dependencies beyond the toolchain.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { libxshmfenceSourceRecipe } from "./libxshmfence-source.js";
import { cProfile } from "../../helpers/c.js";
import { RELOCATE_PKG_CONFIG, STRIP_LIBRARIES } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["xorgproto"],
    pkgConfigDeps: ["xorgproto"],
    pkgConfigPaths: ["/deps/xorgproto/share/pkgconfig"],
  }),
  sourceDir: true,
  script: `
./configure \
  --prefix=/ \
  --enable-shared \
  --disable-static

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_LIBRARIES}
rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", libxshmfenceSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("xorgproto", xorgprotoRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const libxshmfenceRecipe = recipe;
