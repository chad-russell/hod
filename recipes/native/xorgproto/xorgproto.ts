//! xorgproto build recipe — X Window System unified protocol headers.
//!
//! Builds xorgproto 2024.1. Headers-only package (no library).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { xorgprotoSourceRecipe } from "./xorgproto-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

./configure --prefix=/
make -j$(nproc)
make install DESTDIR=$OUT

# Make pkg-config files relocatable
for pc in $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc"
done

rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", xorgprotoSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
});

await importToStore(recipe);
export const xorgprotoRecipe = recipe;
