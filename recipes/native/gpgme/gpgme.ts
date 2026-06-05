//! gpgme build recipe — GnuPG Made Easy library.
//!
//! Builds gpgme 1.24.2 (C library only). Provides libgpgme.so for GPG
//! signature verification and encryption. Required by ostree and flatpak.
//!
//! Patches the configure script to skip C++ checks since we only need the
//! C library and have no C++ compiler in the sandbox.
//!
//! Dependencies:
//!   - libgpg-error (common error codes)
//!   - libassuan (IPC for GnuPG)
//!   - toolchain (gcc, glibc, etc.)

import { shellBuild, dep, importToStore, depSubpath } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libgpgErrorRecipe } from "../libgpg-error/libgpg-error.js";
import { libassuanRecipe } from "../libassuan/libassuan.js";
import { gpgmeSourceRecipe } from "./gpgme-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const gpgmeRuntimeDeps = ["libassuan", "libgpg-error", "toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["libgpg-error", "libassuan"],
    libDeps: ["libgpg-error", "libassuan"],
    pkgConfigDeps: ["libgpg-error", "libassuan"],
  }),
  sourceDir: true,
  script: `
export PATH="${depSubpath("libgpg-error", "bin")}:${depSubpath("libassuan", "bin")}:\${PATH}"
export LD_LIBRARY_PATH="/deps/libgpg-error/lib:/deps/libassuan/lib"

# Patch configure to skip C++ detection (we only build the C library).
# Replace the AC_PROG_CXX block: set CXX to a no-op to avoid /lib/cpp fallback.
sed -i 's|ac_cpp=.*$CXXCPP.*|ac_cpp="$CC -E"|' configure
sed -i 's|ac_compile=.*$CXX.*-c.*|ac_compile="$CC -c $CFLAGS $CPPFLAGS conftest.$ac_ext"|' configure
sed -i 's|ac_link=.*$CXX.*-o.*|ac_link="$CC -o conftest$ac_exeext $CFLAGS $CPPFLAGS $LDFLAGS conftest.$ac_ext $LIBS"|' configure
sed -i '/checking whether we are cross compiling/,+1{/running in a cross environment/{n;s/.*$/  : ;/}}' configure

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --enable-languages= \\
  --disable-gpg-test \\
  --disable-gpgsm-test \\
  --disable-gpgconf-test \\
  --with-gpg=gpg \\
  --with-gpgsm=/nonexistent \\
  --with-gpgconf=/nonexistent

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
rm -rf $OUT/share/man $OUT/share/info
`,
  deps: [
    dep("source", gpgmeSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("libgpg-error", libgpgErrorRecipe),
    dep("libassuan", libassuanRecipe),
  ],
  runtime_deps: gpgmeRuntimeDeps,
});

await importToStore(recipe);
export const gpgmeRecipe = recipe;
