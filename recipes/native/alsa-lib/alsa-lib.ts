import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { alsaLibSourceRecipe } from "./alsa-lib-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

./configure \\
  --prefix=/ \\
  --libdir=/lib \\
  --enable-shared \\
  --disable-static \\
  --disable-python \\
  --disable-old-symbols \\
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

for pc in $OUT/lib/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc"
done

/deps/toolchain/bin/strip $OUT/lib/libasound.so.*.*.* 2>/dev/null || true
rm -rf $OUT/share/aclocal $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", alsaLibSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const alsaLibRecipe = recipe;
