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
import { libsndfileRecipe } from "../libsndfile/libsndfile.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    includeDeps: ["dbus", "alsa", "openssl", "expat", "eudev", "libsndfile"],
    libDeps: ["dbus", "alsa", "openssl", "expat", "zlib", "eudev", "libsndfile"],
    pkgConfigDeps: ["dbus", "alsa", "openssl", "expat", "eudev", "libsndfile"],
  }),
  sourceDir: true,
  script: `

export LD_LIBRARY_PATH="/deps/dbus/lib:/deps/alsa/lib:/deps/openssl/lib:/deps/expat/lib:/deps/zlib/lib:/deps/eudev/lib:/deps/libsndfile/lib\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
export LDFLAGS="$HOD_DUMMY_RPATH -Wl,-rpath-link,/deps/dbus/lib -Wl,-rpath-link,/deps/openssl/lib -Wl,-rpath-link,/deps/zlib/lib -Wl,-rpath-link,/deps/expat/lib -Wl,-rpath-link,/deps/eudev/lib -Wl,-rpath-link,/deps/libsndfile/lib"

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
  -Dsndfile=enabled \\
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
  -Dpw-cat=enabled \\
  -Dsession-managers=[]

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
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
    dep("libsndfile", libsndfileRecipe),
  ],
  runtime_deps: ["alsa", "dbus", "eudev", "libsndfile", "openssl", "toolchain"],
});

await importToStore(recipe);
export const pipewireRecipe = recipe;
