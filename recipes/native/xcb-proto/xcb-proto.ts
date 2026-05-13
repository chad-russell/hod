//! xcb-proto build recipe — XCB protocol XML descriptions.
//!
//! Installs xcb-proto 1.17.0. Data-only package (XML files used by libxcb
//! to generate C code at build time). No shared libraries.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { xcbProtoSourceRecipe } from "./xcb-proto-source.js";
import { pythonRecipe } from "../python/python.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile({
    binDeps: ["python"],
  }),
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
