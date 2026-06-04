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
import { RELOCATE_PKG_CONFIG, STRIP_LIBRARIES } from "../../helpers/strip.js";

export const libXcbRuntimeDeps = ["libXau", "libXdmcp", "toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    binDeps: ["python"],
    includeDeps: ["xorgproto", "libXau", "libXdmcp"],
    libDeps: ["libXau", "libXdmcp"],
    pkgConfigDeps: ["libXau", "libXdmcp", "libpthread-stubs"],
    // TODO: pkgConfigPaths no longer needed — cProfile() now auto-includes
    // both lib/pkgconfig and share/pkgconfig for each pkgConfigDeps entry.
    // Add "xorgproto", "xcb-proto" to pkgConfigDeps and remove this block.
    pkgConfigPaths: ["/deps/xorgproto/share/pkgconfig", "/deps/xcb-proto/share/pkgconfig"],
  }),
  sourceDir: true,
  script: `
export PYTHON="/deps/python/bin/python3"
export LD_LIBRARY_PATH="/deps/expat/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --without-doxygen

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

# Strip shared libraries
${STRIP_LIBRARIES}

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
