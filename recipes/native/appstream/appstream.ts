//! appstream build recipe — cross-distribution software metadata format.
//!
//! Builds AppStream 1.1.2. Uses C++20.
//! Dependencies: glib, curl, libxml2, libfyaml, xmlb, libiconv.
//! Required by libadwaita.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { appstreamSourceRecipe } from "./appstream-source.js";
import { glibRecipe } from "../glib/glib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { curlRecipe } from "../curl/curl.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { libxml2Recipe } from "../libxml2/libxml2.js";
import { libfyamlRecipe } from "../libfyaml/libfyaml.js";
import { xmlbRecipe } from "../xmlb/xmlb.js";
import { gperfRecipe } from "../gperf/gperf.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const appstreamRuntimeDeps = [
  "curl", "glib", "libffi", "libfyaml", "libiconv", "libxml2",
  "openssl", "pcre2", "toolchain", "xmlb", "zlib",
];

const recipe = await shellBuild({
  ...mesonProfile({
    cxx: true,
    python: "python",
    binDeps: ["gperf"],
    includeDeps: ["glib", "libffi", "pcre2", "zlib", "libiconv", "curl", "openssl", "libxml2", "libfyaml", "xmlb"],
    includePaths: [
      "/deps/glib/include/glib-2.0",
      "/deps/glib/lib/glib-2.0/include",
      "/deps/libxml2/include/libxml2",
    ],
    libDeps: ["glib", "libffi", "pcre2", "zlib", "libiconv", "curl", "openssl", "libxml2", "libfyaml", "xmlb"],
    pkgConfigDeps: ["glib", "libffi", "pcre2", "zlib", "libiconv", "curl", "openssl", "libxml2", "libfyaml", "xmlb"],
  }),
  sourceDir: true,
  script: `
# Skip translations, data, docs, contrib, tests (no gettext, no need for these)
sed -i -e "/subdir('po/d" -e "/subdir('data/d" -e "/subdir('contrib/d" -e "/subdir('docs/d" -e "/subdir('tests/d" meson.build

# Allow meson's test programs and linker to find shared deps
export LD_LIBRARY_PATH="/deps/glib/lib:/deps/libffi/lib:/deps/pcre2/lib:/deps/zlib/lib:/deps/libiconv/lib:/deps/curl/lib:/deps/openssl/lib:/deps/libxml2/lib:/deps/libfyaml/lib:/deps/xmlb/lib"
export LDFLAGS="$HOD_DUMMY_RPATH -Wl,-rpath-link,/deps/glib/lib -Wl,-rpath-link,/deps/libffi/lib -Wl,-rpath-link,/deps/pcre2/lib -Wl,-rpath-link,/deps/zlib/lib -Wl,-rpath-link,/deps/libiconv/lib -Wl,-rpath-link,/deps/curl/lib -Wl,-rpath-link,/deps/openssl/lib -Wl,-rpath-link,/deps/libxml2/lib -Wl,-rpath-link,/deps/libfyaml/lib -Wl,-rpath-link,/deps/xmlb/lib"

meson setup _build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddefault_library=shared \\
  -Dstemming=false \\
  -Dsystemd=false \\
  -Dvapi=false \\
  -Dqt=false \\
  -Dcompose=false \\
  -Dbash-completion=false \\
  -Dapt-support=false \\
  -Dgir=false \\
  -Dsvg-support=false \\
  -Dzstd-support=false \\
  -Ddocs=false \\
  -Dapidocs=false \\
  -Dinstall-docs=false \\
  -Dman=false \\
  -Dmaintainer=false

ninja -C _build
DESTDIR=$OUT ninja -C _build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", appstreamSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("glib", glibRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("zlib", zlibRecipe),
    dep("libiconv", libiconvRecipe),
    dep("curl", curlRecipe),
    dep("openssl", opensslRecipe),
    dep("libxml2", libxml2Recipe),
    dep("libfyaml", libfyamlRecipe),
    dep("xmlb", xmlbRecipe),
    dep("gperf", gperfRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: appstreamRuntimeDeps,
});

await importToStore(recipe);
export const appstreamRecipe = recipe;
