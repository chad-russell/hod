//! at-spi2-core build recipe — accessibility infrastructure.
//!
//! Builds at-spi2-core 2.54.1. Provides atk-bridge-2.0 which GTK3 requires.
//! Depends on dbus, glib, libxml2, X11 libs.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { atSpi2CoreSourceRecipe } from "./at-spi2-core-source.js";
import { glibRecipe } from "../glib/glib.js";
import { dbusRecipe } from "../dbus/dbus.js";
import { libxml2Recipe } from "../libxml2/libxml2.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { xzRecipe } from "../xz/xz.js";
import { expatRecipe } from "../expat/expat.js";
import { libX11Recipe } from "../libX11/libX11.js";
import { libXextRecipe } from "../libXext/libXext.js";
import { libXiRecipe } from "../libXi/libXi.js";
import { libXfixesRecipe } from "../libXfixes/libXfixes.js";
import { libXtstRecipe } from "../libXtst/libXtst.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { RELOCATE_PKG_CONFIG, STRIP_ALL } from "../../helpers/strip.js";

export const atSpi2CoreRuntimeDeps = [
  "dbus", "expat", "glib", "libX11", "libXau", "libXcb", "libXdmcp",
  "libXext", "libXi", "libXtst", "libffi", "libiconv", "libxml2",
  "pcre2", "toolchain", "xz", "zlib",
];

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    binDeps: ["glib"],
    includeDeps: ["glib", "dbus", "libxml2", "libX11", "libXext", "libXi", "libXfixes", "libXtst", "libffi", "pcre2", "zlib", "libiconv", "xz", "libXau", "libXcb", "libXdmcp"],
    libDeps: ["glib", "dbus", "libxml2", "libX11", "libXext", "libXi", "libXfixes", "libXtst", "libffi", "pcre2", "zlib", "libiconv", "xz", "libXau", "libXcb", "libXdmcp"],
    pkgConfigDeps: ["glib", "dbus", "libxml2", "libX11", "libXext", "libXi", "libXfixes", "libXtst", "libffi", "pcre2", "zlib", "xz", "libXau", "libXcb", "libXdmcp"],
    // TODO: pkgConfigPaths no longer needed — cProfile() now auto-includes
    // both lib/pkgconfig and share/pkgconfig for each pkgConfigDeps entry.
    // Add "xorgproto" to pkgConfigDeps and remove this pkgConfigPaths block.
    pkgConfigPaths: ["/deps/xorgproto/share/pkgconfig"],
  }),
  sourceDir: true,
  script: `
export LD_LIBRARY_PATH="/deps/glib/lib:/deps/dbus/lib:/deps/libxml2/lib:/deps/libffi/lib:/deps/pcre2/lib:/deps/zlib/lib:/deps/libiconv/lib:/deps/xz/lib:/deps/expat/lib:/deps/libX11/lib:/deps/libXext/lib:/deps/libXi/lib:/deps/libXtst/lib:/deps/libXau/lib:/deps/libXcb/lib:/deps/libXdmcp/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

export LDFLAGS="$HOD_DUMMY_RPATH \
  -L/deps/glib/lib -L/deps/dbus/lib -L/deps/libxml2/lib \
  -L/deps/libffi/lib -L/deps/pcre2/lib -L/deps/zlib/lib \
  -L/deps/libiconv/lib -L/deps/xz/lib \
  -L/deps/libX11/lib -L/deps/libXext/lib -L/deps/libXi/lib -L/deps/libXtst/lib \
  -L/deps/libXau/lib -L/deps/libXcb/lib -L/deps/libXdmcp/lib \
  -Wl,-rpath-link,/deps/glib/lib -Wl,-rpath-link,/deps/dbus/lib \
  -Wl,-rpath-link,/deps/libxml2/lib -Wl,-rpath-link,/deps/libffi/lib \
  -Wl,-rpath-link,/deps/pcre2/lib -Wl,-rpath-link,/deps/zlib/lib \
  -Wl,-rpath-link,/deps/libiconv/lib -Wl,-rpath-link,/deps/xz/lib \
  -Wl,-rpath-link,/deps/libX11/lib -Wl,-rpath-link,/deps/libXext/lib \
  -Wl,-rpath-link,/deps/libXi/lib -Wl,-rpath-link,/deps/libXtst/lib \
  -Wl,-rpath-link,/deps/libXau/lib -Wl,-rpath-link,/deps/libXcb/lib \
  -Wl,-rpath-link,/deps/libXdmcp/lib"

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddefault_library=shared \\
  -Dintrospection=disabled \\
  -Ddocs=false \\
  -Dgtk2_atk_adaptor=false \\
  -Dx11=enabled \\
  -Datk_only=false \\
  -Dsystemd_user_dir=no

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", atSpi2CoreSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("glib", glibRecipe),
    dep("dbus", dbusRecipe),
    dep("libxml2", libxml2Recipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("zlib", zlibRecipe),
    dep("libiconv", libiconvRecipe),
    dep("xz", xzRecipe),
    dep("expat", expatRecipe),
    dep("libX11", libX11Recipe),
    dep("libXext", libXextRecipe),
    dep("libXi", libXiRecipe),
    dep("libXfixes", libXfixesRecipe),
    dep("libXtst", libXtstRecipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: atSpi2CoreRuntimeDeps,
});

await importToStore(recipe);
export const atSpi2CoreRecipe = recipe;
