//! libxcb build recipe — X C Binding library.
//!
//! Builds libxcb 1.17.0. The X C Binding is a replacement for Xlib,
//! providing a thinner API closer to the X11 protocol.
//!
//! Build-time dependency on Python: libxcb uses Python to generate C code
//! from the xcb-proto XML descriptions.
//!
//! Also needs libXau and libXdmcp at build time and runtime.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libXcbSourceRecipe } from "./libxcb-source.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { xcbProtoRecipe } from "../xcb-proto/xcb-proto.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { libpthreadStubsRecipe } from "../libpthread-stubs/libpthread-stubs.js";
import { pythonRecipe } from "../python/python.js";
import { expatRecipe } from "../expat/expat.js";
import { cProfile } from "../../helpers/c.js";

export const libXcbRuntimeDeps = ["libXau", "libXdmcp", "toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    binDeps: ["python"],
    includeDeps: ["xorgproto", "libXau", "libXdmcp"],
    libDeps: ["libXau", "libXdmcp"],
    pkgConfigDeps: ["libXau", "libXdmcp", "libpthread-stubs"],
    pkgConfigPaths: ["/deps/xorgproto/share/pkgconfig", "/deps/xcb-proto/share/pkgconfig"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

export PYTHON="/deps/python/bin/python3"
export LD_LIBRARY_PATH="/deps/expat/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --without-doxygen

make -j$(nproc)
make install DESTDIR=$OUT

# Make pkg-config files relocatable
for pc in $OUT/lib/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc"
done

# Strip shared libraries
find $OUT/lib -name '*.so*' -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true

# Clean up
rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", libXcbSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("xcb-proto", xcbProtoRecipe),
    dep("libXau", libXauRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("libpthread-stubs", libpthreadStubsRecipe),
    dep("python", pythonRecipe),
    dep("expat", expatRecipe),
  ],
  runtime_deps: libXcbRuntimeDeps,
});

await importToStore(recipe);
export const libXcbRecipe = recipe;
