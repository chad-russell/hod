//! shared-mime-info build recipe — freedesktop.org MIME database.
//!
//! Builds shared-mime-info 2.4 data and update-mime-database tool.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { sharedMimeInfoSourceRecipe } from "./shared-mime-info-source.js";
import { glibRecipe } from "../glib/glib.js";
import { libxml2Recipe } from "../libxml2/libxml2.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { xzRecipe } from "../xz/xz.js";
import { expatRecipe } from "../expat/expat.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const sharedMimeInfoRuntimeDeps = ["glib", "libffi", "libiconv", "libxml2", "pcre2", "toolchain", "xz", "zlib"];

const recipe = await shellBuild({
  ...mesonProfile({
    cxx: true,
    python: "python",
    binDeps: ["glib", "libxml2"],
    includeDeps: ["glib", "libxml2", "zlib", "libffi", "pcre2", "libiconv", "xz"],
    libDeps: ["glib", "libxml2", "zlib", "libffi", "pcre2", "libiconv", "xz"],
    pkgConfigDeps: ["glib", "libxml2", "zlib", "libffi", "pcre2", "xz"],
  }),
  sourceDir: true,
  script: `

# Avoid requiring gettext/msgfmt during this bootstrap pass. Install the
# untranslated MIME XML template directly as freedesktop.org.xml.
cat > data/meson.build <<'EOF'
if build_machine.system() != 'windows'
    install_man('update-mime-database.1')
endif

freedesktop_org_xml = configure_file(
    input: 'freedesktop.org.xml.in',
    output: 'freedesktop.org.xml',
    copy: true,
    install: true,
    install_dir: get_option('datadir') / 'mime' / 'packages',
)

install_data(
  [ 'its/shared-mime-info.loc', 'its/shared-mime-info.its', ],
  install_dir : get_option('datadir') / 'gettext/its'
)

if xmlto.found()
    custom_target('shared-mime-info-spec-html',
        input : 'shared-mime-info-spec.xml',
        output: 'shared-mime-info-spec-html',
        command: [
            xmlto,
            '-o', '@OUTPUT@',
            'html-nochunks',
            '@INPUT@',
        ],
        build_by_default: true,
    )
endif
EOF

export LD_LIBRARY_PATH="/tmp/build/build/src:/deps/glib/lib:/deps/libxml2/lib:/deps/zlib/lib:/deps/libffi/lib:/deps/pcre2/lib:/deps/libiconv/lib:/deps/xz/lib:/deps/expat/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export LDFLAGS="$HOD_DUMMY_RPATH \
  -Wl,-rpath-link,/deps/glib/lib -Wl,-rpath-link,/deps/libxml2/lib -Wl,-rpath-link,/deps/zlib/lib \
  -Wl,-rpath-link,/deps/libffi/lib -Wl,-rpath-link,/deps/pcre2/lib -Wl,-rpath-link,/deps/libiconv/lib \
  -Wl,-rpath-link,/deps/xz/lib"

meson setup build \
  --prefix=/ \
  --libdir=lib \
  --buildtype=release \
  -Dupdate-mimedb=false \
  -Dbuild-tools=true \
  -Dbuild-translations=false \
  -Dbuild-tests=false

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", sharedMimeInfoSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("glib", glibRecipe),
    dep("libxml2", libxml2Recipe),
    dep("zlib", zlibRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("libiconv", libiconvRecipe),
    dep("xz", xzRecipe),
    dep("expat", expatRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: sharedMimeInfoRuntimeDeps,
});

await importToStore(recipe);
export const sharedMimeInfoRecipe = recipe;
