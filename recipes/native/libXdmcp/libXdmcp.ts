//! libXdmcp build recipe — X Display Manager Control Protocol library.
//!
//! Builds libXdmcp 1.1.5. Shared library.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libXdmcpSourceRecipe } from "./libXdmcp-source.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { cProfile } from "../../helpers/c.js";

export const libXdmcpRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["xorgproto"],
    // TODO: pkgConfigPaths no longer needed — cProfile() now auto-includes
    // both lib/pkgconfig and share/pkgconfig for each pkgConfigDeps entry.
    // Add "xorgproto" to pkgConfigDeps and remove this pkgConfigPaths block.
    pkgConfigPaths: ["/deps/xorgproto/share/pkgconfig"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static

make -j$(nproc)
make install DESTDIR=$OUT

for pc in $OUT/lib/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc"
done

find $OUT/lib -name '*.so*' -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", libXdmcpSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("xorgproto", xorgprotoRecipe),
  ],
  runtime_deps: libXdmcpRuntimeDeps,
});

await importToStore(recipe);
export const libXdmcpRecipe = recipe;
