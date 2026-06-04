//! Lua 5.4 build recipe.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";
import { luaSourceRecipe } from "./lua-source.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `
make -j$(nproc) linux \
  CC="$CC" \
  AR="$AR rcu" \
  RANLIB="$RANLIB" \
  MYCFLAGS="$CFLAGS -fPIC" \
  MYLDFLAGS="$LDFLAGS" \
  MYLIBS="-lm"

make install INSTALL_TOP=$OUT

mkdir -p $OUT/lib/pkgconfig
cat > $OUT/lib/pkgconfig/lua-5.4.pc <<'EOF'
prefix=\${pcfiledir}/../..
exec_prefix=\${prefix}
libdir=\${exec_prefix}/lib
includedir=\${prefix}/include

Name: Lua
Description: An Extensible Extension Language
Version: 5.4.8
Libs: -L\${libdir} -llua -lm
Cflags: -I\${includedir}
EOF

ln -sf lua-5.4.pc $OUT/lib/pkgconfig/lua54.pc
ln -sf lua-5.4.pc $OUT/lib/pkgconfig/lua.pc

${STRIP_BINARIES}
rm -rf $OUT/share/man $OUT/share/doc 2>/dev/null || true
`,
  deps: [
    dep("source", luaSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const luaRecipe = recipe;
