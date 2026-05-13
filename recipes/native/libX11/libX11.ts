//! libX11 build recipe — X11 client library.
//!
//! Builds libX11 1.8.11. The core X11 client library for communicating
//! with X Window System servers. The most fundamental library for any
//! X11 GUI application.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libX11SourceRecipe } from "./libX11-source.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { xtransRecipe } from "../xtrans/xtrans.js";
import { cProfile } from "../../helpers/c.js";

export const libX11RuntimeDeps = ["libXau", "libXcb", "libXdmcp", "toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["xorgproto", "libXau", "libXcb"],
    libDeps: ["libXcb", "libXau"],
    pkgConfigDeps: ["libXcb", "libXau", "libXdmcp"],
    pkgConfigPaths: ["/deps/xorgproto/share/pkgconfig", "/deps/xtrans/share/pkgconfig"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

cat > /tmp/build/rawcpp <<'EOF'
#!/bin/sh
exec /deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin -E "$@" -
EOF
chmod +x /tmp/build/rawcpp
export RAWCPP=/tmp/build/rawcpp

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-specs \\
  --disable-unit-tests

make -j$(nproc)
make install DESTDIR=$OUT

# Make pkg-config files relocatable
for pc in $OUT/lib/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc"
done

# Strip shared libraries
find $OUT/lib -name '*.so*' -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true

# Clean up — keep pkgconfig for downstream deps
rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", libX11SourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXau", libXauRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("xtrans", xtransRecipe),
  ],
  runtime_deps: libX11RuntimeDeps,
});

await importToStore(recipe);
export const libX11Recipe = recipe;
