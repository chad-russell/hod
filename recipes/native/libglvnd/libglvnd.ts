//! libglvnd — EGL/GL vendor-neutral dispatch library.
//!
//! Provides libEGL.so, libGL.so, libGLESv2.so as vendor-neutral dispatchers.
//! These dispatchers can load Mesa (or proprietary NVIDIA) drivers at runtime.
//!
//! Meson build. Depends on libX11, wayland, libdrm (for EGL platform support).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libglvndSourceRecipe } from "./libglvnd-source.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { libX11Recipe } from "../libX11/libX11.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { libXextRecipe } from "../libXext/libXext.js";
import { libXxf86vmRecipe } from "../libXxf86vm/libXxf86vm.js";
import { waylandRecipe } from "../wayland/wayland.js";
import { libdrmRecipe } from "../libdrm/libdrm.js";
import { expatRecipe } from "../expat/expat.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_LIBRARIES, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const libglvndRuntimeDeps = ["libX11", "libdrm", "toolchain", "wayland"];

const profile = mesonProfile({
  includeDeps: ["xorgproto", "libX11", "libXau", "libXcb", "libXdmcp", "libXext", "libXxf86vm", "libdrm", "wayland"],
  libDeps: ["libX11", "libXau", "libXcb", "libXdmcp", "libXext", "libXxf86vm", "libdrm", "wayland"],
  pkgConfigDeps: ["libX11", "libXau", "libXcb", "libXdmcp", "libXext", "libXxf86vm", "libdrm", "wayland"],
  pkgConfigPaths: ["/deps/xorgproto/share/pkgconfig"],
});
const mergedEnv = {
  ...(profile.env as Record<string, string>),
  LD_LIBRARY_PATH: "/deps/zlib/lib:/deps/expat/lib",
};

const recipe = await shellBuild({
  ...profile,
  env: mergedEnv,
  deps: [
    dep("source", libglvndSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("libX11", libX11Recipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("libXext", libXextRecipe),
    dep("libXxf86vm", libXxf86vmRecipe),
    dep("wayland", waylandRecipe),
    dep("libdrm", libdrmRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
    dep("zlib", zlibRecipe),
    dep("expat", expatRecipe),
  ],
  sourceDir: true,
  script: `
meson setup builddir --prefix=/ \
  -Degl=true \
  -Dglx=enabled \
  -Dgles1=false \
  -Dgles2=true \
  -Dx11=enabled

ninja -C builddir
DESTDIR=$OUT ninja -C builddir install

${RELOCATE_PKG_CONFIG}

${STRIP_LIBRARIES}
rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
`,
  runtime_deps: libglvndRuntimeDeps,
});

await importToStore(recipe);
export const libglvndRecipe = recipe;
