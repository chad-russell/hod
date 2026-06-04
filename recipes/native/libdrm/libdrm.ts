//! libdrm build recipe — userspace interface to kernel DRM services.
//!
//! Builds libdrm 2.4.124 with core library only (no GPU driver backends).
//! Required by GTK4 on Linux (for drm_fourcc.h and pkg-config dependency).
//! Dependencies: toolchain only (uses pthreads from glibc).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libdrmSourceRecipe } from "./libdrm-source.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const libdrmRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  ...mesonProfile({ python: "python" }),
  sourceDir: true,
  script: `
meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddefault_library=shared \\
  -Dintel=disabled \\
  -Dradeon=disabled \\
  -Damdgpu=disabled \\
  -Dnouveau=disabled \\
  -Dvmwgfx=disabled \\
  -Dfreedreno=disabled \\
  -Dvc4=disabled \\
  -Detnaviv=disabled \\
  -Dcairo-tests=disabled \\
  -Dman-pages=disabled \\
  -Dvalgrind=disabled \\
  -Dtests=false

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", libdrmSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("zlib", zlibRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: libdrmRuntimeDeps,
});

await importToStore(recipe);
export const libdrmRecipe = recipe;
