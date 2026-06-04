//! dbus build recipe — inter-process communication system.
//!
//! Builds D-Bus 1.16.2 with expat XML parser. Provides libdbus-1 for at-spi2-core.
//! Minimal build: no systemd, no selinux, no X11 autolaunch, no apparmor.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { dbusSourceRecipe } from "./dbus-source.js";
import { expatRecipe } from "../expat/expat.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { RELOCATE_PKG_CONFIG, STRIP_ALL } from "../../helpers/strip.js";

export const dbusRuntimeDeps = ["expat", "toolchain"];

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    includeDeps: ["expat"],
    libDeps: ["expat"],
    pkgConfigDeps: ["expat"],
  }),
  sourceDir: true,
  script: `
export LD_LIBRARY_PATH="/deps/zlib/lib:/deps/expat/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export LDFLAGS="$HOD_DUMMY_RPATH \
  -Wl,-rpath-link,/deps/expat/lib -Wl,-rpath-link,/deps/zlib/lib"

# Patch out test subdir — the test data copy script fails in our sandbox.
# We only need libdbus-1, not the test infrastructure.
sed -i "/subdir('test')/d" meson.build
sed -i "/subdir('doc')/d" meson.build

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddefault_library=shared \\
  -Dsystemd=disabled \\
  -Dselinux=disabled \\
  -Dapparmor=disabled \\
  -Dinotify=enabled \\
  -Dx11_autolaunch=disabled \\
  -Ddoxygen_docs=disabled \\
  -Dducktype_docs=disabled \\
  -Dxml_docs=disabled \\
  -Dmodular_tests=disabled

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", dbusSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("expat", expatRecipe),
    dep("zlib", zlibRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: dbusRuntimeDeps,
});

await importToStore(recipe);
export const dbusRecipe = recipe;
