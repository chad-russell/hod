//! flatpak build recipe — Linux application sandboxing and distribution.
//!
//! Builds flatpak 1.16.6 with curl backend, GPG signature verification,
//! seccomp sandboxing, and Wayland security context support. Configured
//! without systemd, docs, or introspection.
//!
//! Uses pre-built bubblewrap and xdg-dbus-proxy from Hod recipes instead
//! of the bundled subprojects.

import { shellBuild, dep, importToStore, depSubpath } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { flatpakSourceRecipe } from "./flatpak-source.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { glibRecipe } from "../glib/glib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { ostreeRecipe } from "../ostree/ostree.js";
import { curlRecipe } from "../curl/curl.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { nghttp2Recipe } from "../nghttp2/nghttp2.js";
import { gpgmeRecipe } from "../gpgme/gpgme.js";
import { libgpgErrorRecipe } from "../libgpg-error/libgpg-error.js";
import { libassuanRecipe } from "../libassuan/libassuan.js";
import { libarchiveRecipe } from "../libarchive/libarchive.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { libxml2Recipe } from "../libxml2/libxml2.js";
import { jsonGlibRecipe } from "../json-glib/json-glib.js";
import { appstreamRecipe } from "../appstream/appstream.js";
import { gdkPixbufRecipe } from "../gdk-pixbuf/gdk-pixbuf.js";
import { libseccompRecipe } from "../libseccomp/libseccomp.js";
import { libcapRecipe } from "../libcap/libcap.js";
import { fuse3Recipe } from "../fuse3/fuse3.js";
import { bubblewrapRecipe } from "../bubblewrap/bubblewrap.js";
import { xdgDbusProxyRecipe } from "../xdg-dbus-proxy/xdg-dbus-proxy.js";
import { xzRecipe } from "../xz/xz.js";
import { zstdRecipe } from "../zstd/zstd.js";
import { e2fsprogsRecipe } from "../e2fsprogs/e2fsprogs.js";
import { utilLinuxRecipe } from "../util-linux/util-linux.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { waylandRecipe } from "../wayland/wayland.js";
import { waylandProtocolsRecipe } from "../wayland-protocols/wayland-protocols.js";
import { expatRecipe } from "../expat/expat.js";
import { bisonRecipe } from "../bison/bison.js";
import { tinysparqlRecipe } from "../tinysparql/tinysparql.js";
import { libjpegRecipe } from "../libjpeg/libjpeg.js";
import { libpngRecipe } from "../libpng/libpng.js";
import { libtiffRecipe } from "../libtiff/libtiff.js";
import { pyparsingRecipe } from "../pyparsing/pyparsing.js";
import { gnupgRecipe } from "../gnupg/gnupg.js";
import { libgcryptRecipe } from "../libgcrypt/libgcrypt.js";
import { libksbaRecipe } from "../libksba/libksba.js";
import { npthRecipe } from "../npth/npth.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const flatpakRuntimeDeps = [
  "appstream", "curl", "fuse3", "gdk-pixbuf", "glib", "gnupg", "gpgme",
  "json-glib", "libXau", "libarchive", "libassuan", "libcap", "libffi",
  "libgcrypt", "libgpg-error", "libksba", "libseccomp", "libxml2", "nghttp2",
  "npth", "openssl", "ostree", "pcre2", "tinysparql", "toolchain",
  "util-linux", "wayland", "xz", "zlib", "zstd",
];

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    binDeps: ["glib", "bison", "bubblewrap", "xdg-dbus-proxy", "fuse3"],
    includeDeps: [
      "glib", "ostree", "curl", "gpgme", "libgpg-error", "libarchive",
      "json-glib", "appstream", "gdk-pixbuf", "libseccomp", "libcap",
      "fuse3", "zstd", "xz", "zlib", "e2fsprogs", "libxml2", "libXau",
      "wayland", "tinysparql", "xorgproto",
    ],
    libDeps: [
      "glib", "ostree", "curl", "gpgme", "libgpg-error", "libarchive",
      "json-glib", "appstream", "gdk-pixbuf", "libseccomp", "libcap",
      "fuse3", "zstd", "xz", "zlib", "e2fsprogs", "libxml2", "libXau",
      "wayland", "tinysparql", "util-linux", "nghttp2", "openssl",
    ],
    pkgConfigDeps: [
      "glib", "pcre2", "libffi", "ostree", "curl", "gpgme", "libgpg-error",
      "libarchive", "json-glib", "appstream", "gdk-pixbuf", "libseccomp",
      "libcap", "fuse3", "zstd", "xz", "zlib", "e2fsprogs", "libxml2",
      "libXau", "wayland", "tinysparql", "util-linux", "nghttp2", "openssl",
      "xorgproto", "libjpeg", "libpng", "libtiff", "libassuan",
      "wayland-protocols", "expat",
    ],
    pkgConfigPaths: [
      "/deps/xorgproto/share/pkgconfig",
      "/deps/wayland-protocols/share/pkgconfig",
    ],
  }),
  sourceDir: true,
  script: `
mkdir -p /include /usr/include

export PYTHONPATH="/deps/pyparsing/lib/python3/site-packages"
export LD_LIBRARY_PATH="/deps/glib/lib:/deps/ostree/lib:/deps/curl/lib:/deps/openssl/lib:/deps/nghttp2/lib:/deps/gpgme/lib:/deps/libgpg-error/lib:/deps/libassuan/lib:/deps/libarchive/lib:/deps/json-glib/lib:/deps/appstream/lib:/deps/gdk-pixbuf/lib:/deps/libseccomp/lib:/deps/libcap/lib:/deps/fuse3/lib:/deps/zstd/lib:/deps/xz/lib:/deps/zlib/lib:/deps/libxml2/lib:/deps/libXau/lib:/deps/wayland/lib:/deps/tinysparql/lib:/deps/util-linux/lib"

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Dhttp_backend=curl \\
  -Dsystem_bubblewrap=bwrap \\
  -Dsystem_dbus_proxy=xdg-dbus-proxy \\
  -Dsystem_fusermount=fusermount3 \\
  -Dsystemd=disabled \\
  -Dsystem_helper=disabled \\
  -Dtests=false \\
  -Dman=disabled \\
  -Dgtkdoc=disabled \\
  -Dgir=disabled \\
  -Ddocbook_docs=disabled \\
  -Dselinux_module=disabled \\
  -Ddconf=disabled \\
  -Dmalcontent=disabled \\
  -Dauto_sideloading=false \\
  -Dsandboxed_triggers=false \\
  -Dinstalled_tests=false \\
  -Dprofile_dir= \\
  -Drun_media_dir=/run/media

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
rm -rf $OUT/share/gtk-doc $OUT/share/man $OUT/share/info $OUT/share/doc
`,
  deps: [
    dep("source", flatpakSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
    dep("glib", glibRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("zlib", zlibRecipe),
    dep("ostree", ostreeRecipe),
    dep("curl", curlRecipe),
    dep("openssl", opensslRecipe),
    dep("nghttp2", nghttp2Recipe),
    dep("gpgme", gpgmeRecipe),
    dep("libgpg-error", libgpgErrorRecipe),
    dep("libassuan", libassuanRecipe),
    dep("libarchive", libarchiveRecipe),
    dep("bzip2", bzip2Recipe),
    dep("libiconv", libiconvRecipe),
    dep("libxml2", libxml2Recipe),
    dep("json-glib", jsonGlibRecipe),
    dep("appstream", appstreamRecipe),
    dep("gdk-pixbuf", gdkPixbufRecipe),
    dep("libseccomp", libseccompRecipe),
    dep("libcap", libcapRecipe),
    dep("fuse3", fuse3Recipe),
    dep("bubblewrap", bubblewrapRecipe),
    dep("xdg-dbus-proxy", xdgDbusProxyRecipe),
    dep("xz", xzRecipe),
    dep("zstd", zstdRecipe),
    dep("e2fsprogs", e2fsprogsRecipe),
    dep("util-linux", utilLinuxRecipe),
    dep("libXau", libXauRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("wayland", waylandRecipe),
    dep("wayland-protocols", waylandProtocolsRecipe),
    dep("expat", expatRecipe),
    dep("bison", bisonRecipe),
    dep("tinysparql", tinysparqlRecipe),
    dep("libjpeg", libjpegRecipe),
    dep("libpng", libpngRecipe),
    dep("libtiff", libtiffRecipe),
    dep("pyparsing", pyparsingRecipe),
    dep("gnupg", gnupgRecipe),
    dep("libgcrypt", libgcryptRecipe),
    dep("libksba", libksbaRecipe),
    dep("npth", npthRecipe),
  ],
  runtime_deps: flatpakRuntimeDeps,
});

await importToStore(recipe);
export const flatpakRecipe = recipe;
