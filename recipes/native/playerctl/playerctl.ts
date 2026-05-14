//! playerctl native build recipe — MPRIS media player controller.
//!
//! Builds playerctl 2.4.1, a command-line utility for controlling media players
//! via the MPRIS D-Bus interface. Dependencies: glib (all built).
//!
//! Produces:
//!   - playerctl (CLI tool for controlling MPRIS players)
//!   - playerctld (daemon for tracking the most recently active player)
//!   - libplayerctl.so (shared library for MPRIS control)
//!
//! Disabled options:
//!   - introspection (gobject-introspection not packaged)
//!   - gtk-doc (documentation generation not needed)
//!   - bash-completions / zsh-completions (not needed in sandbox)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { playerctlSourceRecipe } from "./playerctl-source.js";
import { glibRecipe, glibRuntimeDeps } from "../glib/glib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { expatRecipe } from "../expat/expat.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...mesonProfile({
    includeDeps: ["glib", "libffi", "pcre2", "zlib"],
    libDeps: ["glib", "libffi", "pcre2", "zlib"],
    pkgConfigDeps: ["glib", "libffi", "pcre2", "zlib"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# glib's gio/gobject tools and shared libs need their runtime deps on LD_LIBRARY_PATH
# during the build for meson's compile/test steps.
export LD_LIBRARY_PATH="/deps/glib/lib:/deps/libffi/lib:/deps/pcre2/lib:/deps/zlib/lib:/deps/expat/lib"

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Dintrospection=false \\
  -Dgtk-doc=false \\
  -Dbash-completions=false \\
  -Dzsh-completions=false

ninja -C build
DESTDIR=$OUT ninja -C build install

# Make pkg-config files relocatable via pcfiledir (pkgconf extension).
for pc in $OUT/lib/pkgconfig/*.pc $OUT/lib64/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */lib64/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../../..|' "$pc" ;;
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

# Strip binaries and shared libs, remove docs.
${STRIP_ALL}
`,
  deps: [
    dep("source", playerctlSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("glib", glibRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("zlib", zlibRecipe),
    dep("expat", expatRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: [...glibRuntimeDeps],
});

await importToStore(recipe);
export const playerctlRecipe = recipe;
