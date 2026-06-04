//! gnome-autoar build recipe — GNOME archive creation/extraction library.
//!
//! Builds gnome-autoar 0.4.5. Provides libgnome-autoar for creating and
//! extracting archives. Dependencies: glib, libarchive. GTK3 widgets disabled.
//! Required by Nautilus.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { gnomeAutoarSourceRecipe } from "./gnome-autoar-source.js";
import { glibRecipe } from "../glib/glib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { libarchiveRecipe } from "../libarchive/libarchive.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { xzRecipe } from "../xz/xz.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { libxml2Recipe } from "../libxml2/libxml2.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const gnomeAutoarRuntimeDeps = [
  "bzip2", "glib", "libarchive", "libffi", "libiconv", "openssl",
  "pcre2", "toolchain", "xz", "zlib",
];

const libDepNames = [
  "glib", "libffi", "pcre2", "zlib", "libarchive",
  "bzip2", "xz", "openssl", "libxml2", "libiconv",
];

const rpathLinkFlags = libDepNames.map((d) => `-Wl,-rpath-link,/deps/${d}/lib`).join(" ");

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    includeDeps: ["glib", "libffi", "pcre2", "zlib", "libarchive", "libxml2", "libiconv"],
    includePaths: ["/deps/glib/include/glib-2.0", "/deps/glib/lib/glib-2.0/include"],
    libDeps: ["glib", "libffi", "pcre2", "zlib", "libarchive", "bzip2", "xz", "openssl", "libxml2", "libiconv"],
    pkgConfigDeps: ["glib", "libffi", "pcre2", "zlib", "libarchive", "bzip2", "xz", "openssl", "libxml2", "libiconv"],
  }),
  sourceDir: true,
  script: `
export LDFLAGS="$HOD_DUMMY_RPATH ${rpathLinkFlags}"

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddefault_library=shared \\
  -Dgtk=false \\
  -Dintrospection=disabled \\
  -Dvapi=false \\
  -Dtests=false \\
  -Dgtk_doc=false

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", gnomeAutoarSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("glib", glibRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("zlib", zlibRecipe),
    dep("libarchive", libarchiveRecipe),
    dep("bzip2", bzip2Recipe),
    dep("xz", xzRecipe),
    dep("openssl", opensslRecipe),
    dep("libxml2", libxml2Recipe),
    dep("libiconv", libiconvRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: gnomeAutoarRuntimeDeps,
});

await importToStore(recipe);
export const gnomeAutoarRecipe = recipe;
