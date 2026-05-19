//! Mesa 26.0.7 — open-source OpenGL/EGL/GBM graphics stack.
//!
//! Builds Mesa with the llvmpipe software rasterizer for GPU rendering
//! in VMs and environments without hardware GPU drivers.
//!
//! ## Drivers
//!
//! - **llvmpipe** (Gallium): Software OpenGL renderer using LLVM JIT.
//!   Provides OpenGL 4.6 compatibility via CPU rasterization.
//! - No Vulkan drivers (lavapipe can be added later if needed).
//!
//! ## Libraries produced
//!
//! - `libEGL.so` — EGL platform interface (Wayland/X11/surfaceless)
//! - `libGL.so` — OpenGL (GLX + indirect rendering)
//! - `libGLESv2.so` — OpenGL ES 2.0/3.0
//! - `libgbm.so` — Generic Buffer Manager (needed by Wayland compositors)
//! - `libglapi.so` — GL API dispatch
//! - `libgallium-*.so` — Gallium driver shared library (contains llvmpipe)
//! - DRI driver backends in `lib/dri/`
//! - GBM backend in `lib/gbm/`
//!
//! ## LLVM integration
//!
//! Mesa links against our LLVM 22.1.5 prebuilt. Since the prebuilt only has
//! static archives (no libLLVM.so), Mesa links LLVM statically into its
//! gallium driver. This means LLVM is NOT a runtime dependency — its code
//! is embedded in the Mesa shared libraries.
//!
//! We use a meson native file to tell meson exactly where llvm-config is,
//! and we set `-Dshared-llvm=false` to link statically against LLVM's
//! individual component archives.
//!
//! ## Build dependencies
//!
//! Build tools: meson, ninja, python, mako, pyyaml, packaging, flex, bison
//! Graphics/input: LLVM, libdrm, wayland, wayland-protocols, libglvnd
//! X11 stack: libX11, libXext, libXrandr, libXdamage, libXfixes, libxshmfence,
//!   libXxf86vm, libxcb, libXau, libXdmcp, xorgproto
//! Core libs: zlib, expat

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { mesaSourceRecipe } from "./mesa-source.js";
import { llvmRecipe } from "../llvm/llvm.js";
import { libglvndRecipe, libglvndRuntimeDeps } from "../libglvnd/libglvnd.js";
import { libdrmRecipe } from "../libdrm/libdrm.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { expatRecipe } from "../expat/expat.js";
import { waylandRecipe } from "../wayland/wayland.js";
import { waylandProtocolsRecipe } from "../wayland-protocols/wayland-protocols.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { libX11Recipe } from "../libX11/libX11.js";
import { libXextRecipe } from "../libXext/libXext.js";
import { libXrandrRecipe } from "../libXrandr/libXrandr.js";
import { libXdamageRecipe } from "../libXdamage/libXdamage.js";
import { libXfixesRecipe } from "../libXfixes/libXfixes.js";
import { libxshmfenceRecipe } from "../libxshmfence/libxshmfence.js";
import { libXxf86vmRecipe } from "../libXxf86vm/libXxf86vm.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { libXrenderRecipe } from "../libXrender/libXrender.js";
import { m4Recipe } from "../m4/m4.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { makoRecipe } from "../mako/mako.js";
import { pyyamlRecipe } from "../pyyaml/pyyaml.js";
import { packagingRecipe } from "../packaging/packaging.js";
import { flexRecipe } from "../flex/flex.js";
import { bisonRecipe } from "../bison/bison.js";
import { zstdRecipe } from "../zstd/zstd.js";
import { libxml2Recipe } from "../libxml2/libxml2.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL } from "../../helpers/strip.js";

// All deps that provide shared libs — used for LD_LIBRARY_PATH.
const libDepNames = [
  "libdrm", "libglvnd", "wayland", "zlib", "expat", "zstd", "libxml2",
  "libX11", "libXext", "libXrandr", "libXdamage", "libXfixes",
  "libxshmfence", "libXxf86vm", "libXcb", "libXau", "libXdmcp",
];

// All deps whose include/ and pkg-config dirs need to be on search paths.
const allPkgConfigDeps = [
  "libdrm", "libglvnd", "wayland", "wayland-protocols", "zlib", "expat",
  "xorgproto", "libffi",
  "libX11", "libXext", "libXrandr", "libXdamage", "libXfixes",
  "libxshmfence", "libXxf86vm", "libXcb", "libXau", "libXdmcp",
  "libXrender",
];

const allIncludeDeps = [
  "libdrm", "libglvnd", "wayland", "zlib", "expat", "xorgproto",
  "libX11", "libXext", "libXrandr", "libXdamage", "libXfixes",
  "libxshmfence", "libXxf86vm", "libXcb", "libXau", "libXdmcp",
  "libxml2",
];

// LD_LIBRARY_PATH for meson's cc.run() checks
const ldLibraryPath = libDepNames.map((d) => `/deps/${d}/lib`).join(":");

// rpath-link flags for the linker
const rpathLinkFlags = libDepNames.map((d) => `-Wl,-rpath-link,/deps/${d}/lib`).join(" \\\n  ");

// Mesa's runtime deps: all shared libraries in its link chain.
// LLVM is NOT a runtime dep since we link it statically.
export const mesaRuntimeDeps = [
  "expat", "libX11", "libXau", "libXcb", "libXdamage", "libXdmcp",
  "libXext", "libXfixes", "libXrandr", "libXxf86vm",
  "libdrm", "libglvnd", "libxshmfence", "toolchain", "wayland", "zlib", "zstd",
];

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    binDeps: ["flex", "bison", "llvm", "m4"],
    includeDeps: allIncludeDeps,
    libDeps: libDepNames,
    pkgConfigDeps: allPkgConfigDeps,
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# === PYTHONPATH for mako, pyyaml, packaging ===
export PYTHONPATH="/deps/mako/lib/python3/site-packages:/deps/pyyaml/lib/python3/site-packages:/deps/packaging/lib/python3/site-packages"

# === C++ compiler (needed for LLVM/llvmpipe C++ code) ===
export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export CXXFLAGS="-O2"

# === LD_LIBRARY_PATH for meson's cc.run() checks ===
export LD_LIBRARY_PATH="${ldLibraryPath}\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"

# === LDFLAGS: dummy RPATH + rpath-link for all deps ===
export LDFLAGS="$HOD_DUMMY_RPATH \\
  ${rpathLinkFlags}"

# === llvm-config wrapper ===
# Mesa uses meson's config-tool method which calls llvm-config directly.
# llvm-config --system-libs outputs hardcoded /usr/lib paths for libzstd.a.
# We create a wrapper that remaps those, and use a meson native file to
# point meson at the wrapper.
mkdir -p /tmp/llvm-bin
cat > /tmp/llvm-bin/llvm-config << 'WRAPPER_EOF'
#!/bin/sh
REAL=/deps/llvm/bin/llvm-config
# We need to:
# 1. Remap staging paths in ldflags/cppflags output to /deps/llvm
# 2. Replace hardcoded /usr/lib/*.a paths in --system-libs output with -l flags
# 3. Handle compound queries (e.g. --libs --ldflags --system-libs together)

# Get the real staging prefix to use in sed remapping
STAGING_PREFIX=$($REAL --prefix)

# Just run the real llvm-config and post-process the output
output=$($REAL "$@" 2>&1)
ret=$?
if [ $ret -ne 0 ]; then
  echo "$output" >&2
  exit $ret
fi

# Remap staging paths to /deps/llvm
echo "$output" | sed "s|$STAGING_PREFIX|/deps/llvm|g" | sed 's|/usr/lib/x86_64-linux-gnu/libzstd.a|-lzstd|g' | sed 's|/usr/lib/x86_64-linux-gnu/libxml2.a|-lxml2|g'
WRAPPER_EOF
chmod +x /tmp/llvm-bin/llvm-config

# === Create meson native file to point at our llvm-config ===
cat > /tmp/native.ini << 'NATIVE_EOF'
[binaries]
llvm-config = '/tmp/llvm-bin/llvm-config'
NATIVE_EOF

# === Verify Python packages ===
echo "=== Checking Python packages ==="
/deps/python/bin/python3 -c "import mako; print('Mako:', mako.__version__)"
/deps/python/bin/python3 -c "import yaml; print('PyYAML:', yaml.__version__)" || echo "WARNING: yaml import failed"
/deps/python/bin/python3 -c "import packaging; print('packaging:', packaging.__version__)" || echo "WARNING: packaging import failed"

# === Verify llvm-config wrapper ===
echo "=== LLVM version ==="
/tmp/llvm-bin/llvm-config --version
echo "=== LLVM system libs ==="
/tmp/llvm-bin/llvm-config --system-libs
echo "=== LLVM libdir ==="
/tmp/llvm-bin/llvm-config --libdir
echo "=== LLVM ldflags ==="
/tmp/llvm-bin/llvm-config --ldflags

# === Configure Mesa ===
meson setup build \\
  --native-file /tmp/native.ini \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Dplatforms=x11,wayland \\
  -Dgallium-drivers=llvmpipe \\
  -Dvulkan-drivers= \\
  -Dshared-llvm=false \\
  -Degl=enabled \\
  -Dgbm=enabled \\
  -Dglx=dri \\
  -Dgles1=disabled \\
  -Dgles2=enabled \\
  -Dvalgrind=disabled \\
  -Dlibunwind=disabled \
  -Dcpp_rtti=false

echo "=== Mesa configure complete ==="

# === Build ===
ninja -C build

echo "=== Mesa build complete ==="

# === Install ===
DESTDIR=$OUT ninja -C build install

echo "=== Mesa install complete ==="

# === Make pkg-config files relocatable ===
for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\\\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\\\${pcfiledir}/../..|' "$pc" ;;
  esac
done

# === Strip shared libraries ===
${STRIP_ALL}

# === Verification ===
echo "=== Mesa libraries ==="
ls -la $OUT/lib/libEGL.so* $OUT/lib/libGL.so* $OUT/lib/libGLESv2.so* $OUT/lib/libgbm.so* 2>/dev/null || echo "WARNING: expected libs missing"
echo "=== Mesa DRI drivers ==="
ls $OUT/lib/dri/ 2>/dev/null || echo "WARNING: no DRI drivers"
echo "=== Mesa GBM backends ==="
ls $OUT/lib/gbm/ 2>/dev/null || echo "WARNING: no GBM backends"
echo "=== Mesa pkg-config ==="
ls $OUT/lib/pkgconfig/ 2>/dev/null || echo "WARNING: no pkg-config files"
echo "=== Mesa EGL vendors ==="
ls $OUT/share/glvnd/egl_vendor.d/ 2>/dev/null || echo "WARNING: no EGL vendor files"
echo "=== Mesa installation complete ==="
`,
  deps: [
    dep("source", mesaSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("llvm", llvmRecipe),
    dep("libglvnd", libglvndRecipe),
    dep("libdrm", libdrmRecipe),
    dep("zlib", zlibRecipe),
    dep("expat", expatRecipe),
    dep("zstd", zstdRecipe),
    dep("libxml2", libxml2Recipe),
    dep("libffi", libffiRecipe),
    dep("wayland", waylandRecipe),
    dep("wayland-protocols", waylandProtocolsRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("libX11", libX11Recipe),
    dep("libXext", libXextRecipe),
    dep("libXrandr", libXrandrRecipe),
    dep("libXdamage", libXdamageRecipe),
    dep("libXfixes", libXfixesRecipe),
    dep("libxshmfence", libxshmfenceRecipe),
    dep("libXxf86vm", libXxf86vmRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXau", libXauRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("libXrender", libXrenderRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
    dep("mako", makoRecipe),
    dep("pyyaml", pyyamlRecipe),
    dep("packaging", packagingRecipe),
    dep("flex", flexRecipe),
    dep("bison", bisonRecipe),
    dep("m4", m4Recipe),
  ],
  runtime_deps: mesaRuntimeDeps,
});

await importToStore(recipe);
export const mesaRecipe = recipe;
