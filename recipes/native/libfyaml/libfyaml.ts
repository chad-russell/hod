//! libfyaml build recipe — fully feature-complete YAML parser and emitter.
//!
//! Builds libfyaml 0.9.6. No external dependencies beyond the toolchain.
//! Required by appstream.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libfyamlSourceRecipe } from "./libfyaml-source.js";
import { m4Recipe } from "../m4/m4.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL } from "../../helpers/strip.js";

export const libfyamlRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    binDeps: ["m4"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export CPP="/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin -E"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static

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
    dep("source", libfyamlSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("m4", m4Recipe),
  ],
  runtime_deps: libfyamlRuntimeDeps,
});

await importToStore(recipe);
export const libfyamlRecipe = recipe;
