//! Validate that pkgconf in the toolchain can discover zlib via pkg-config.
//!
//! This demonstrates the key benefit of having pkgconf in the toolchain:
//! downstream packages can use standard `pkg-config` / `pkg_check_modules()`
//! to find library flags instead of manually tracking -I and -L paths.
import { shellBuild, dep, importToStore } from "../../js/src/index.js";
import { nativeToolchainRecipe } from "../toolchain/native-toolchain.js";
import { zlibRecipe } from "./zlib/zlib.js";
import { cProfile } from "../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["zlib"],
    libDeps: ["zlib"],
    pkgConfigDeps: ["zlib"],
  }),
  script: `

echo "=== 1. pkgconf is in the toolchain ==="
ls -la /deps/toolchain/bin/pkgconf
ls -la /deps/toolchain/bin/pkg-config

echo ""
echo "=== 2. pkg-config finds zlib ==="
export PKG_CONFIG_PATH=/deps/zlib/lib/pkgconfig
echo "PKG_CONFIG_PATH=$PKG_CONFIG_PATH"
# --define-prefix rewrites prefix to the .pc file's actual parent directory,
# so /deps/zlib/lib/pkgconfig/zlib.pc with prefix=/ becomes prefix=/deps/zlib
pkg-config --define-prefix --modversion zlib
echo "CFLAGS: $(pkg-config --define-prefix --cflags zlib)"
echo "LIBS:   $(pkg-config --define-prefix --libs zlib)"

echo ""
echo "=== 3. Compile and link a program using pkg-config flags ==="
cat > /tmp/test_zlib.c << 'CEOF'
#include <stdio.h>
#include <zlib.h>

int main(void) {
    printf("zlib version: %s\\n", zlibVersion());
    return 0;
}
CEOF

CFLAGS="$(pkg-config --define-prefix --cflags zlib)"
LIBS="$(pkg-config --define-prefix --libs zlib)"

echo "Compiling: $CC -O2 $CFLAGS /tmp/test_zlib.c -o /tmp/test_zlib $LIBS -static"
$CC -O2 $CFLAGS /tmp/test_zlib.c -o /tmp/test_zlib $LIBS -static
/tmp/test_zlib

echo ""
echo "=== SUCCESS: pkgconf correctly resolved zlib via pkg-config ==="`,
  deps: [
    dep("toolchain", nativeToolchainRecipe),
    dep("zlib", zlibRecipe),
  ],
});

await importToStore(recipe);
export const validatePkgconfRecipe = recipe;
