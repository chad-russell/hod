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

export const dbusRuntimeDeps = ["expat", "toolchain"];

const recipe = await shellBuild({
  ...mesonProfile({
    includeDeps: ["expat"],
    libDeps: ["expat"],
    pkgConfigDeps: ["expat"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

find . -name '*.py' -type f -exec sed -i '1s|^#!/usr/bin/env python3|#!/deps/python/bin/python3|' {} + 2>/dev/null || true

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

for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
find $OUT/lib -name '*.so*' -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
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
