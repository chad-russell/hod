//! libpthread-stubs build recipe — pthread stubs for non-pthread platforms.
//!
//! Installs libpthread-stubs 0.5. On Linux with glibc this is essentially
//! empty (glibc provides real pthreads). It exists to satisfy pkg-config
//! dependencies of libxcb. No shared libraries on Linux.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libpthreadStubsSourceRecipe } from "./libpthread-stubs-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `
./configure --prefix=/

make -j$(nproc)
make install DESTDIR=$OUT

rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", libpthreadStubsSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
});

await importToStore(recipe);
export const libpthreadStubsRecipe = recipe;
