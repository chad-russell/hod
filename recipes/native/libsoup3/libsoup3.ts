//! libsoup3 build recipe — HTTP client/server library for GNOME.
//!
//! Builds libsoup 3.6.6. Provides libsoup-3.0 for HTTP operations.
//! Dependencies: glib, libxml2, nghttp2, libpsl, sqlite, zlib.
//! glib-networking is a runtime dep for TLS, not required at compile time.
//! Required by tinysparql (tracker).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libsoup3SourceRecipe } from "./libsoup3-source.js";
import { glibRecipe } from "../glib/glib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { libxml2Recipe } from "../libxml2/libxml2.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { xzRecipe } from "../xz/xz.js";
import { nghttp2Recipe } from "../nghttp2/nghttp2.js";
import { libpslRecipe } from "../libpsl/libpsl.js";
import { libidn2Recipe } from "../libidn2/libidn2.js";
import { libunistringRecipe } from "../libunistring/libunistring.js";
import { sqliteRecipe } from "../sqlite/sqlite.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const libsoup3RuntimeDeps = [
  "glib", "libffi", "libiconv", "libidn2", "libpsl", "libunistring",
  "libxml2", "nghttp2", "pcre2", "sqlite", "toolchain", "xz", "zlib",
];

const libDepNames = [
  "glib", "libffi", "pcre2", "zlib", "libxml2", "libiconv", "xz",
  "nghttp2", "libpsl", "libidn2", "libunistring", "sqlite",
];

const rpathLinkFlags = libDepNames.map((d) => `-Wl,-rpath-link,/deps/${d}/lib`).join(" ");

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    binDeps: ["glib"],
    includeDeps: [
      "glib", "libffi", "pcre2", "zlib", "libxml2", "libiconv",
      "nghttp2", "libpsl", "libidn2", "libunistring", "sqlite",
    ],
    includePaths: [
      "/deps/glib/include/glib-2.0",
      "/deps/glib/lib/glib-2.0/include",
      "/deps/libxml2/include/libxml2",
    ],
    libDeps: libDepNames,
    pkgConfigDeps: [
      "glib", "libffi", "pcre2", "zlib", "libxml2",
      "nghttp2", "libpsl", "libidn2", "libunistring", "sqlite",
    ],
  }),
  sourceDir: true,
  script: `
export LDFLAGS="$HOD_DUMMY_RPATH \\
  ${rpathLinkFlags}"

# Patch out po/ subdir (needs gettext)
sed -i "/subdir('po')/d" meson.build

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddefault_library=shared \\
  -Dtls_check=false \\
  -Dbrotli=disabled \\
  -Dgssapi=disabled \\
  -Dntlm=disabled \\
  -Dintrospection=disabled \\
  -Dvapi=disabled \\
  -Dtests=false \\
  -Ddocs=disabled \\
  -Dsysprof=disabled \\
  -Dfuzzing=disabled

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", libsoup3SourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("glib", glibRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("zlib", zlibRecipe),
    dep("libxml2", libxml2Recipe),
    dep("libiconv", libiconvRecipe),
    dep("xz", xzRecipe),
    dep("nghttp2", nghttp2Recipe),
    dep("libpsl", libpslRecipe),
    dep("libidn2", libidn2Recipe),
    dep("libunistring", libunistringRecipe),
    dep("sqlite", sqliteRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: libsoup3RuntimeDeps,
});

await importToStore(recipe);
export const libsoup3Recipe = recipe;
