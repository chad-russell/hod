//! json-glib build recipe — JSON parser library for GLib/GObject.
//!
//! Builds JSON-GLib 1.10.0. Dependencies: glib (and its transitive deps).
//! Used by tinysparql (tracker).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { jsonGlibSourceRecipe } from "./json-glib-source.js";
import { glibRecipe } from "../glib/glib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL } from "../../helpers/strip.js";

export const jsonGlibRuntimeDeps = ["glib", "libffi", "pcre2", "toolchain", "zlib"];

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    includeDeps: ["glib", "libffi", "pcre2", "zlib"],
    includePaths: ["/deps/glib/include/glib-2.0", "/deps/glib/lib/glib-2.0/include"],
    libDeps: ["glib", "libffi", "pcre2", "zlib"],
    pkgConfigDeps: ["glib", "libffi", "pcre2", "zlib"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddefault_library=shared \\
  -Dintrospection=disabled \\
  -Dgtk_doc=disabled \\
  -Dtests=false \\
  -Dman=false \\
  -Dnls=disabled

ninja -C build
DESTDIR=$OUT ninja -C build install

# Make pkg-config files relocatable.
for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

${STRIP_ALL}
`,
  deps: [
    dep("source", jsonGlibSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("glib", glibRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("zlib", zlibRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: jsonGlibRuntimeDeps,
});

await importToStore(recipe);
export const jsonGlibRecipe = recipe;
