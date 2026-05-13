//! glib build recipe — GNOME core utility library.
//!
//! Builds GLib 2.82.5 with libffi, PCRE2, and zlib. Optional Linux/system
//! integrations are disabled for the first GTK3 stack pass.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { glibSourceRecipe } from "./glib-source.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { expatRecipe } from "../expat/expat.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL } from "../../helpers/strip.js";

export const glibRuntimeDeps = ["libffi", "pcre2", "toolchain", "zlib"];

const recipe = await shellBuild({
  ...mesonProfile({
    includeDeps: ["libffi", "pcre2", "zlib"],
    libDeps: ["libffi", "pcre2", "zlib"],
    pkgConfigDeps: ["libffi", "pcre2", "zlib"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

export LD_LIBRARY_PATH="/deps/expat/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export LDFLAGS="$HOD_DUMMY_RPATH -L/deps/pcre2/lib -L/deps/libffi/lib -L/deps/zlib/lib -Wl,-rpath-link,/deps/pcre2/lib -Wl,-rpath-link,/deps/libffi/lib -Wl,-rpath-link,/deps/zlib/lib"

# Some GLib helper scripts use /usr/bin/env in shebangs.
find . -name '*.py' -type f -exec sed -i '1s|^#!/usr/bin/env python3|#!/deps/python/bin/python3|' {} +

meson setup build \
  --prefix=/ \
  --libdir=lib \
  --buildtype=release \
  -Ddefault_library=shared \
  -Dselinux=disabled \
  -Dlibmount=disabled \
  -Dman=false \
  -Dman-pages=disabled \
  -Ddtrace=disabled \
  -Dsystemtap=disabled \
  -Dsysprof=disabled \
  -Ddocumentation=false \
  -Dgtk_doc=false \
  -Dtests=false \
  -Dinstalled_tests=false \
  -Dnls=disabled \
  -Dlibelf=disabled \
  -Dintrospection=disabled

ninja -C build
DESTDIR=$OUT ninja -C build install

# Make pkg-config files relocatable.
for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

find $OUT/bin $OUT/libexec -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
${STRIP_ALL}
`,
  deps: [
    dep("source", glibSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("zlib", zlibRecipe),
    dep("expat", expatRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: glibRuntimeDeps,
});

await importToStore(recipe);
export const glibRecipe = recipe;
