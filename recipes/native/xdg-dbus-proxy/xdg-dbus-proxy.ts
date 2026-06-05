//! xdg-dbus-proxy build recipe — D-Bus proxy for flatpak sandboxing.
//!
//! Builds xdg-dbus-proxy 0.1.7. Filters D-Bus traffic for sandboxed
//! applications. Required by flatpak at runtime.
//!
//! Dependencies:
//!   - glib (GLib/GIO/GIO-Unix)
//!   - toolchain (gcc, glibc, etc.)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { glibRecipe } from "../glib/glib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { xdgDbusProxySourceRecipe } from "./xdg-dbus-proxy-source.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    includeDeps: ["glib", "pcre2", "libffi", "zlib"],
    libDeps: ["glib", "pcre2", "libffi", "zlib"],
    pkgConfigDeps: ["glib", "pcre2", "libffi", "zlib"],
  }),
  sourceDir: true,
  script: `
meson setup build \\
  --prefix=/ \\
  --buildtype=release \\
  -Dman=disabled \\
  -Dtests=false

ninja -C build
DESTDIR=$OUT ninja -C build install

${STRIP_ALL}
rm -rf $OUT/share/man
`,
  deps: [
    dep("source", xdgDbusProxySourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("glib", glibRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("zlib", zlibRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: ["glib", "libffi", "pcre2", "toolchain", "zlib"],
});

await importToStore(recipe);
export const xdgDbusProxyRecipe = recipe;
