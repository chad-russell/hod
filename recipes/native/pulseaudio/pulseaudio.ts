import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { pulseaudioSourceRecipe } from "./pulseaudio-source.js";
import { mesonProfile } from "../../helpers/meson.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";

import { zlibRecipe } from "../zlib/zlib.js";
import { m4Recipe } from "../m4/m4.js";

const recipe = await shellBuild({
  ...mesonProfile({ python: "python", libDeps: ["zlib"], binDeps: ["m4"] }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# Make sndfile dependency optional (only needed by daemon, not client lib).
sed -i "s/sndfile_dep = dependency('sndfile', version : '>= 1.0.20')/sndfile_dep = dependency('sndfile', version : '>= 1.0.20', required : false)/" meson.build

# Exclude sndfile-util from libpulsecommon when sndfile is absent.
sed -i "/pulsecore.sndfile-util.c/d" src/meson.build
sed -i "/pulsecore.sndfile-util.h/d" src/meson.build
sed -i "s/, sndfile_dep//" src/meson.build

# Skip utils (pacat, pactl) — they need sndfile.h and we only need the client lib.
# Replace subdir('utils') with a comment in src/meson.build.
sed -i "s/^subdir('utils')/# subdir('utils') -- skipped, needs sndfile/" src/meson.build

export LD_LIBRARY_PATH="/deps/zlib/lib\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
export LDFLAGS="$HOD_DUMMY_RPATH -Wl,-rpath-link,/deps/zlib/lib"

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddaemon=false \\
  -Ddoxygen=false \\
  -Dman=false \\
  -Dtests=false \\
  -Ddatabase=simple \\
  -Dalsa=disabled \\
  -Dasyncns=disabled \\
  -Dbluez5=disabled \\
  -Dconsolekit=disabled \\
  -Ddbus=disabled \\
  -Delogind=disabled \\
  -Dfftw=disabled \\
  -Dglib=disabled \\
  -Dgsettings=disabled \\
  -Dgstreamer=disabled \\
  -Dgtk=disabled \\
  -Djack=disabled \\
  -Dlirc=disabled \\
  -Dopenssl=disabled \\
  -Dorc=disabled \\
  -Doss-output=disabled \\
  -Dsamplerate=disabled \\
  -Dsoxr=disabled \\
  -Dspeex=disabled \\
  -Dsystemd=disabled \\
  -Dtcpwrap=disabled \\
  -Dudev=disabled \\
  -Dvalgrind=disabled \\
  -Dx11=disabled \\
  -Dwebrtc-aec=disabled

ninja -C build
DESTDIR=$OUT ninja -C build install

for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

find $OUT/lib -name '*.so*' -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
rm -rf $OUT/share/doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true

# Create symlink so libpulsecommon is findable alongside libpulse.so.
# The linker resolves transitive deps via -rpath-link, not -L.
# Having it in the same dir avoids that issue.
if [ -d "$OUT/lib/pulseaudio" ]; then
  for f in $OUT/lib/pulseaudio/libpulsecommon*.so*; do
    [ -f "$f" ] && ln -sf pulseaudio/\$(basename "$f") $OUT/lib/
  done
fi
`,
  deps: [
    dep("source", pulseaudioSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
    dep("zlib", zlibRecipe),
    dep("m4", m4Recipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const pulseaudioRecipe = recipe;
