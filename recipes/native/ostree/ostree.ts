//! ostree build recipe — content-addressed object store and deployment system.
//!
//! Builds libostree 2025.7 with minimal features for flatpak. Configured with
//! curl (HTTP backend), gpgme (signature verification), fuse3 (rofiles-fuse),
//! libarchive (import), and libmount. Disabled: systemd, selinux, avahi,
//! composefs, libsoup, introspection, gtk-doc.
//!
//! Dependencies:
//!   - glib (GLib/GIO)
//!   - xz (liblzma)
//!   - zlib
//!   - e2fsprogs-libs (e2p header)
//!   - curl (HTTP backend)
//!   - gpgme + libgpg-error (GPG signatures)
//!   - libarchive (import support)
//!   - fuse3 (rofiles-fuse helper)
//!   - util-linux (libmount)

import { shellBuild, dep, importToStore, depSubpath } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { ostreeSourceRecipe } from "./ostree-source.js";
import { glibRecipe } from "../glib/glib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { xzRecipe } from "../xz/xz.js";
import { e2fsprogsRecipe } from "../e2fsprogs/e2fsprogs.js";
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
import { fuse3Recipe } from "../fuse3/fuse3.js";
import { utilLinuxRecipe } from "../util-linux/util-linux.js";
import { bisonRecipe } from "../bison/bison.js";
import { pythonRecipe } from "../python/python.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const ostreeRuntimeDeps = [
  "curl", "glib", "gpgme", "libarchive", "libassuan", "libffi",
  "libgpg-error", "pcre2", "toolchain", "xz", "zlib",
];

const recipe = await shellBuild({
  ...cProfile({
    python: "python",
    binDeps: ["bison", "glib"],
    includeDeps: [
      "glib", "xz", "zlib", "e2fsprogs", "curl", "gpgme",
      "libgpg-error", "libarchive", "fuse3", "util-linux",
    ],
    includePaths: [
      "/deps/glib/include/glib-2.0",
      "/deps/glib/lib/glib-2.0/include",
      "/deps/curl/include",
      "/deps/libarchive/include",
    ],
    libDeps: [
      "glib", "xz", "zlib", "e2fsprogs", "curl", "gpgme",
      "libgpg-error", "libarchive", "fuse3", "util-linux",
    ],
    pkgConfigDeps: [
      "glib", "pcre2", "libffi", "xz", "zlib", "e2fsprogs", "curl",
      "openssl", "nghttp2", "gpgme", "libgpg-error", "libarchive",
      "fuse3", "util-linux", "libxml2", "libiconv", "bzip2",
    ],
  }),
  sourceDir: true,
  script: `
mkdir -p /include /usr/include

export PATH="${depSubpath("libgpg-error", "bin")}:${depSubpath("gpgme", "bin")}:\${PATH}"
export LD_LIBRARY_PATH="/deps/glib/lib:/deps/xz/lib:/deps/zlib/lib:/deps/curl/lib:/deps/openssl/lib:/deps/nghttp2/lib:/deps/gpgme/lib:/deps/libgpg-error/lib:/deps/libassuan/lib:/deps/libarchive/lib:/deps/fuse3/lib:/deps/util-linux/lib"

export GLIB_CFLAGS="-I/deps/glib/include/glib-2.0 -I/deps/glib/lib/glib-2.0/include"
export GLIB_LIBS="-L/deps/glib/lib -lglib-2.0 -lgio-2.0 -lgobject-2.0 -lgmodule-2.0"
export GLIB_MKENUMS="${depSubpath("glib", "bin/glib-mkenums")}"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --with-curl \\
  --without-soup \\
  --without-soup3 \\
  --with-gpgme \\
  --with-crypto=glib \\
  --without-selinux \\
  --without-libsystemd \\
  --without-avahi \\
  --without-composefs \\
  --without-libarchive \\
  --without-libmount \\
  --disable-gtk-doc \\
  --disable-introspection \\
  --disable-man

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
rm -rf $OUT/share/gtk-doc $OUT/share/man $OUT/share/info
`,
  deps: [
    dep("source", ostreeSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("glib", glibRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("zlib", zlibRecipe),
    dep("xz", xzRecipe),
    dep("e2fsprogs", e2fsprogsRecipe),
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
    dep("fuse3", fuse3Recipe),
    dep("util-linux", utilLinuxRecipe),
    dep("bison", bisonRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: ostreeRuntimeDeps,
});

await importToStore(recipe);
export const ostreeRecipe = recipe;
