//! gnupg build recipe — GNU Privacy Guard.
//!
//! Builds gnupg 2.4.9 (oldstable) with minimal components: gpg and gpg-agent.
//! Uses 2.4.x instead of 2.5.x because 2.5 requires keyboxd daemon for key
//! storage, which complicates relocated binary usage.
//!
//! Provides the `gpg` binary needed by flatpak for repository GPG verification.
//!
//! --with-agent-pgm=gpg-agent makes gpg find gpg-agent via PATH instead of a
//! compiled-in absolute path. NixOS solves this differently: it builds with
//! --prefix=/nix/store/<hash>-gnupg so the compiled-in path is already valid.
//! Hod uses DESTDIR staging, so PATH lookup is the pragmatic equivalent.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { gnupgSourceRecipe } from "./gnupg-source.js";
import { libgpgErrorRecipe } from "../libgpg-error/libgpg-error.js";
import { libgcryptRecipe } from "../libgcrypt/libgcrypt.js";
import { libassuanRecipe } from "../libassuan/libassuan.js";
import { libksbaRecipe } from "../libksba/libksba.js";
import { npthRecipe } from "../npth/npth.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const gnupgRuntimeDeps = [
  "bzip2", "libassuan", "libgcrypt", "libgpg-error", "libiconv", "libksba",
  "npth", "toolchain", "zlib",
];

const recipe = await shellBuild({
  ...cProfile({
    binDeps: ["libgpg-error"],
    includeDeps: ["libgpg-error", "libgcrypt", "libassuan", "libksba", "npth", "libiconv"],
    libDeps: ["libgpg-error", "libgcrypt", "libassuan", "libksba", "npth", "zlib", "bzip2", "libiconv"],
    pkgConfigDeps: [
      "libgpg-error", "libgcrypt", "libassuan", "libksba", "npth",
    ],
  }),
  sourceDir: true,
  script: `
export PATH=/deps/libgpg-error/bin:$PATH

# GnuPG's POSIX spawn helper uses execv(), so a configured helper name without
# a slash (for example --with-agent-pgm=gpg-agent) is treated as a relative
# path instead of being resolved through PATH. NixOS avoids this because its
# configure prefix is the final /nix/store path. Hod builds with --prefix=/ and
# DESTDIR, so patch no-slash helper names to use PATH lookup.
sed -i "s|  execv (pgmname, arg_list);|  if (strchr (pgmname, '/')) execv (pgmname, arg_list); else execvp (pgmname, arg_list);|" common/exechelp-posix.c

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-nls \\
  --disable-gpgsm \\
  --disable-scdaemon \\
  --disable-dirmngr \\
  --disable-keyboxd \\
  --disable-tpm2d \\
  --disable-g13 \\
  --disable-wks-tools \\
  --disable-doc \\
  --disable-gnutls \\
  --disable-sqlite \\
  --disable-ldap \\
  --with-pinentry-pgm=/usr/bin/pinentry \\
  --with-agent-pgm=gpg-agent \\
  --without-libiconv-prefix

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
rm -rf $OUT/share/man $OUT/share/info $OUT/share/doc

# Remove gpgconf — it reports compiled-in paths (e.g. //bin/gpg) from gnupg's
# --prefix=/, which are invalid on the host. Without gpgconf, gpgme falls back
# to PATH-based binary discovery (GnuPG-1 compat mode), which works correctly
# with Hod's profile symlink farm.
rm -f $OUT/bin/gpgconf
`,
  deps: [
    dep("source", gnupgSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("libgpg-error", libgpgErrorRecipe),
    dep("libgcrypt", libgcryptRecipe),
    dep("libassuan", libassuanRecipe),
    dep("libksba", libksbaRecipe),
    dep("npth", npthRecipe),
    dep("zlib", zlibRecipe),
    dep("bzip2", bzip2Recipe),
    dep("libiconv", libiconvRecipe),
  ],
  runtime_deps: gnupgRuntimeDeps,
});

await importToStore(recipe);
export const gnupgRecipe = recipe;
