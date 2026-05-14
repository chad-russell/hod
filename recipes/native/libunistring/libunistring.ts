//! libunistring build recipe — Unicode string library for C.
//!
//! Builds libunistring 1.3. No external dependencies beyond the toolchain.
//! Required by tinysparql for Unicode support.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libunistringSourceRecipe } from "./libunistring-source.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL } from "../../helpers/strip.js";

export const libunistringRuntimeDeps = ["libiconv", "toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["libiconv"],
    libDeps: ["libiconv"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-rpath

make -j$(nproc)
make install DESTDIR=$OUT

# Make pkg-config files relocatable.
for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

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
