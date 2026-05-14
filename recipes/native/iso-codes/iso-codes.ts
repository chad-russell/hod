//! iso-codes build recipe — ISO country, language, script and currency codes.
//!
//! Builds iso-codes 4.18.0. A data-only package providing JSON files
//! for ISO standards and a pkg-config file for discovery.
//! Needs python3 at build time to generate XML from JSON.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { isoCodesSourceRecipe } from "./iso-codes-source.js";
import { pythonRecipe } from "../python/python.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile({
    python: "python",
    binDeps: ["python"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

./configure \\
  --prefix=/

make -j$(nproc)
make install DESTDIR=$OUT

# Make pkg-config file relocatable.
for pc in $OUT/share/pkgconfig/*.pc $OUT/lib/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

# Clean up — remove translations we don't need, keep JSON data and pc file
rm -rf $OUT/share/locale 2>/dev/null || true
`,
  deps: [
    dep("source", isoCodesSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: [],
});

await importToStore(recipe);
export const isoCodesRecipe = recipe;
