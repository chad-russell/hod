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
import { RELOCATE_PKG_CONFIG, STRIP_LIBRARIES } from "../../helpers/strip.js";

export const libX11RuntimeDeps = ["libXau", "libXcb", "libXdmcp", "toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["xorgproto", "libXau", "libXcb"],
    libDeps: ["libXcb", "libXau"],
    pkgConfigDeps: ["libXcb", "libXau", "libXdmcp"],
    // TODO: pkgConfigPaths no longer needed — cProfile() now auto-includes
    // both lib/pkgconfig and share/pkgconfig for each pkgConfigDeps entry.
    // Add "xorgproto", "xtrans" to pkgConfigDeps and remove this block.
    pkgConfigPaths: ["/deps/xorgproto/share/pkgconfig", "/deps/xtrans/share/pkgconfig"],
  }),
  sourceDir: true,
  script: `
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

${RELOCATE_PKG_CONFIG}

# Strip shared libraries
${STRIP_LIBRARIES}

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
