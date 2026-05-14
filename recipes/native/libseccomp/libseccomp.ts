//! libseccomp build recipe — high-level interface to Linux seccomp syscall filtering.
//!
//! Builds libseccomp 2.5.5. No external dependencies beyond the toolchain.
//! Required by gnome-desktop-4.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libseccompSourceRecipe } from "./libseccomp-source.js";
import { gperfRecipe } from "../gperf/gperf.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL } from "../../helpers/strip.js";

export const libseccompRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    binDeps: ["gperf"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-python

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
    dep("source", libseccompSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("gperf", gperfRecipe),
  ],
  runtime_deps: libseccompRuntimeDeps,
});

await importToStore(recipe);
export const libseccompRecipe = recipe;
