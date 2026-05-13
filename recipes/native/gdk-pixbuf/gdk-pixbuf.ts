//! gdk-pixbuf build recipe — image loading library for GTK.
//!
//! Builds gdk-pixbuf 2.42.12 with PNG/GIF support, without introspection,
//! documentation, tests, JPEG, or TIFF for the first GTK3 stack pass.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { gdkPixbufSourceRecipe } from "./gdk-pixbuf-source.js";
import { glibRecipe } from "../glib/glib.js";
import { libpngRecipe } from "../libpng/libpng.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { expatRecipe } from "../expat/expat.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";

export const gdkPixbufRuntimeDeps = ["glib", "libffi", "libpng", "pcre2", "toolchain", "zlib"];

const recipe = await shellBuild({
  ...mesonProfile({
    binDeps: ["glib"],
    includeDeps: ["glib", "libpng", "zlib", "libffi", "pcre2"],
    libDeps: ["glib", "libpng", "zlib", "libffi", "pcre2"],
    pkgConfigDeps: ["glib", "libpng", "zlib", "libffi", "pcre2"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

find . -name '*.py' -type f -exec sed -i '1s|^#!/usr/bin/env python3|#!/deps/python/bin/python3|' {} +

export LD_LIBRARY_PATH="/tmp/build/build/gdk-pixbuf:/deps/glib/lib:/deps/libpng/lib:/deps/zlib/lib:/deps/libffi/lib:/deps/pcre2/lib:/deps/expat/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export LDFLAGS="$HOD_DUMMY_RPATH \
  -Wl,-rpath-link,/deps/glib/lib -Wl,-rpath-link,/deps/libpng/lib -Wl,-rpath-link,/deps/zlib/lib \
  -Wl,-rpath-link,/deps/libffi/lib -Wl,-rpath-link,/deps/pcre2/lib"

meson setup build \
  --prefix=/ \
  --libdir=lib \
  --buildtype=release \
  -Ddefault_library=shared \
  -Dpng=enabled \
  -Djpeg=disabled \
  -Dtiff=disabled \
  -Dgif=enabled \
  -Dothers=disabled \
  -Dbuiltin_loaders=png,gif \
  -Dintrospection=disabled \
  -Dgtk_doc=false \
  -Ddocs=false \
  -Dman=false \
  -Dtests=false \
  -Dinstalled_tests=false \
  -Dgio_sniffing=false

ninja -C build
DESTDIR=$OUT ninja -C build install

for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

find $OUT/bin $OUT/libexec -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
find $OUT/lib -name '*.so*' -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
rm -rf $OUT/share/doc $OUT/share/gtk-doc $OUT/share/man 2>/dev/null || true
`,
  deps: [
    dep("source", gdkPixbufSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("glib", glibRecipe),
    dep("libpng", libpngRecipe),
    dep("zlib", zlibRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("expat", expatRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: gdkPixbufRuntimeDeps,
});

await importToStore(recipe);
export const gdkPixbufRecipe = recipe;
