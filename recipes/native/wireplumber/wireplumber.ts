//! WirePlumber CLI tools — wpctl and wpexec.
//!
//! Builds WirePlumber 0.5.14 with tools/modules enabled, but daemon and service
//! installation disabled. PipeWire/WirePlumber services remain Nix-owned on the
//! ThinkPad; this package is for user-facing CLI tools.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { mesonProfile } from "../../helpers/meson.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { glibRecipe, glibRuntimeDeps } from "../glib/glib.js";
import { pipewireRecipe } from "../pipewire/pipewire.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { expatRecipe } from "../expat/expat.js";
import { luaRecipe } from "../lua/lua.js";
import { wireplumberSourceRecipe } from "./wireplumber-source.js";
import { STRIP_ALL } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    includeDeps: ["glib", "pipewire", "libffi", "lua", "pcre2", "zlib"],
    libDeps: ["glib", "pipewire", "libffi", "lua", "pcre2", "zlib"],
    pkgConfigDeps: ["glib", "pipewire", "libffi", "lua", "pcre2", "zlib"],
  }),
  script: `
cp -a /deps/source/. /tmp/build
cd /tmp/build

# Avoid gettext/libintl while keeping English CLI output.
python3 - <<'PY'
from pathlib import Path
p = Path('meson.build')
s = p.read_text()
s = s.replace("libintl_dep = dependency('intl')", "libintl_dep = dependency('', required: false)")
s = s.replace("subdir('po')", "")
p.write_text(s)
PY

export LD_LIBRARY_PATH="/deps/glib/lib:/deps/pipewire/lib:/deps/libffi/lib:/deps/lua/lib:/deps/pcre2/lib:/deps/zlib/lib:/deps/expat/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export LDFLAGS="$HOD_DUMMY_RPATH -Wl,-rpath-link,/deps/glib/lib -Wl,-rpath-link,/deps/pipewire/lib -Wl,-rpath-link,/deps/libffi/lib -Wl,-rpath-link,/deps/lua/lib -Wl,-rpath-link,/deps/pcre2/lib -Wl,-rpath-link,/deps/zlib/lib"

meson setup build \
  --prefix=/ \
  --libdir=lib \
  --buildtype=release \
  -Dintrospection=disabled \
  -Ddoc=disabled \
  -Dtests=false \
  -Ddbus-tests=false \
  -Ddaemon=false \
  -Dtools=true \
  -Dmodules=true \
  -Dsystem-lua=true \
  -Dsystem-lua-version=5.4 \
  -Dsystemd=disabled \
  -Delogind=disabled \
  -Dsystemd-system-service=false \
  -Dsystemd-user-service=false

ninja -C build
DESTDIR=$OUT ninja -C build install

# wpctl uses libpipewire, which dlopens SPA and PipeWire modules at runtime.
# Copy the host-owned PipeWire modules into this CLI output so the wrappers can
# use prefix-relative module paths after closure transfer.
mkdir -p $OUT/lib
cp -a /deps/pipewire/lib/spa-0.2 $OUT/lib/
cp -a /deps/pipewire/lib/pipewire-0.3 $OUT/lib/
mkdir -p $OUT/share
cp -a /deps/pipewire/share/pipewire $OUT/share/

for bin in $OUT/bin/wpctl $OUT/bin/wpexec; do
  [ -f "$bin" ] || continue
  real="$(basename "$bin")-real"
  mv "$bin" "$OUT/bin/$real"
  cat > "$bin" <<'EOF'
#!/bin/sh
prefix="\$(cd "\$(dirname "\$0")/.." && pwd)"
export SPA_PLUGIN_DIR="\${SPA_PLUGIN_DIR:-$prefix/lib/spa-0.2}"
export PIPEWIRE_MODULE_DIR="\${PIPEWIRE_MODULE_DIR:-$prefix/lib/pipewire-0.3}"
export PIPEWIRE_CONFIG_DIR="\${PIPEWIRE_CONFIG_DIR:-$prefix/share/pipewire}"
export WIREPLUMBER_MODULE_DIR="\${WIREPLUMBER_MODULE_DIR:-$prefix/lib/wireplumber-0.5}"
EOF
  printf 'exec "$(dirname "$0")/%s" "$@"\n' "$real" >> "$bin"
  chmod +x "$bin"
done

for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

${STRIP_ALL}
find $OUT/bin -type f -name '*-real' -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
rm -rf $OUT/share/doc $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", wireplumberSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
    dep("glib", glibRecipe),
    dep("pipewire", pipewireRecipe),
    dep("lua", luaRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("zlib", zlibRecipe),
    dep("expat", expatRecipe),
  ],
  runtime_deps: ["glib", "libffi", "lua", "pcre2", "pipewire", "toolchain", "zlib"],
});

await importToStore(recipe);
export const wireplumberRecipe = recipe;
