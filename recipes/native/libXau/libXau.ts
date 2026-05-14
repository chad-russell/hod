//! libXau build recipe — X Authorization library.
//!
//! Builds libXau 1.0.12. Tiny library for X11 authorization.
//! Shared library. runtime_deps exported for downstream use.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libXauSourceRecipe } from "./libXau-source.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { cProfile } from "../../helpers/c.js";

export const libXauRuntimeDeps = ["toolchain"];

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

# Make pkg-config files relocatable
for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */lib/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

# Strip shared library
find $OUT/lib -name '*.so*' -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true

# Clean up
rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", libXauSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("xorgproto", xorgprotoRecipe),
  ],
  runtime_deps: libXauRuntimeDeps,
});

await importToStore(recipe);
export const libXauRecipe = recipe;
