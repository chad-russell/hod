import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { pipewireSourceRecipe } from "./pipewire-source.js";
import { mesonProfile } from "../../helpers/meson.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { dbusRecipe } from "../dbus/dbus.js";
import { alsaLibRecipe } from "../alsa-lib/alsa-lib.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { expatRecipe } from "../expat/expat.js";
import { zlibRecipe } from "../zlib/zlib.js";

import { eudevRecipe } from "../eudev/eudev.js";

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    includeDeps: ["dbus", "alsa", "openssl", "expat", "eudev"],
    libDeps: ["dbus", "alsa", "openssl", "expat", "zlib", "eudev"],
    pkgConfigDeps: ["dbus", "alsa", "openssl", "expat", "eudev"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

export LD_LIBRARY_PATH="/deps/dbus/lib:/deps/alsa/lib:/deps/openssl/lib:/deps/expat/lib:/deps/zlib/lib:/deps/eudev/lib\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
export LDFLAGS="$HOD_DUMMY_RPATH -Wl,-rpath-link,/deps/dbus/lib -Wl,-rpath-link,/deps/openssl/lib -Wl,-rpath-link,/deps/zlib/lib -Wl,-rpath-link,/deps/expat/lib -Wl,-rpath-link,/deps/eudev/lib"

# Disable docs, man, tests, examples
# Disable features we don't need: bluez, jack, v4l2, ffmpeg, gstreamer,
# webrtc, opus, sndfile, avahi, sdl2, flatpak, snap, selinux, libsystemd, logind,
# roc, raop, libpulse (separate lib), canberra, libusb, x11
meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddocs=disabled \\
  -Dman=disabled \\
  -Dtests=disabled \\
  -Dexamples=disabled \\
  -Dinstalled_tests=disabled \\
  -Dgstreamer=disabled \\
  -Dgstreamer-device-provider=disabled \\
  -Dsystemd=disabled \\
  -Dlogind=disabled \\
  -Dselinux=disabled \\
  -Dsystemd-system-service=disabled \\
  -Dsystemd-user-service=disabled \\
  -Dspa-plugins=enabled \\
  -Dalsa=enabled \\
  -Dudev=enabled \\
  -Dpipewire-alsa=enabled \\
  -Dpipewire-jack=disabled \\
  -Dpipewire-v4l2=disabled \\
  -Djack-devel=false \\
  -Dbluez5=disabled \\
  -Dffmpeg=disabled \\
  -Davahi=disabled \\
  -Dsdl2=disabled \\
  -Dopus=disabled \\
  -Dsndfile=disabled \\
  -Dlibpulse=disabled \\
  -Draop=disabled \\
  -Droc=disabled \\
  -Dx11=disabled \\
  -Dx11-xfixes=disabled \\
  -Dlibcanberra=disabled \\
  -Dlibusb=disabled \\
  -Dflatpak=disabled \\
  -Dsnap=disabled \\
  -Dgsettings=disabled \\
  -Decho-cancel-webrtc=disabled \\
  -Dlibffado=disabled \\
  -Dpw-cat=disabled \\
  -Dsession-managers=[]

ninja -C build
DESTDIR=$OUT ninja -C build install

# Fix pkg-config paths
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
    dep("source", pipewireSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
    dep("dbus", dbusRecipe),
    dep("alsa", alsaLibRecipe),
    dep("openssl", opensslRecipe),
    dep("expat", expatRecipe),
    dep("zlib", zlibRecipe),
    dep("eudev", eudevRecipe),
  ],
  runtime_deps: ["alsa", "dbus", "eudev", "openssl", "toolchain"],
});

await importToStore(recipe);
export const pipewireRecipe = recipe;
