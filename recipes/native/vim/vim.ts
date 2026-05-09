//! vim native build recipe — the ubiquitous text editor.
//!
//! Builds Vim 9.2 with "huge" features (syntax highlighting, terminal
//! emulation, cscope, multibyte, etc.). Dynamically links shared ncursesw
//! and glibc from the toolchain (both relocated via runtime_deps).
//!
//! Vim's configure lives in src/auto/configure with a wrapper at src/configure
//! that requires autoconf. We invoke auto/configure directly with --srcdir=.
//!
//! We force all AC_TRY_RUN checks to use the cross-compilation path by
//! replacing `test "$cross_compiling" = yes` with `test "yes" = yes`.
//! This skips runtime test programs that can't execute in the hermetic sandbox.
//! We also provide sizeof cache variables and vim_cv cache variables explicitly.
//!
//! Dependencies:
//!   - ncurses (terminal handling) — shared libncursesw

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { ncursesRecipe } from "../ncurses/ncurses.js";
import { vimSourceRecipe } from "./vim-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

# Extract source
tar xf /deps/source/source -C /tmp
cd /tmp/vim-9.2.0000/src

# Point at shared ncursesw via relocatable .pc files.
export PKG_CONFIG_PATH="/deps/ncurses/lib/pkgconfig"
export CPPFLAGS="-I/deps/ncurses/include/ncursesw"
export LDFLAGS="$HOD_DUMMY_RPATH -L/deps/ncurses/lib"

# Force cross-compilation mode to skip all AC_TRY_RUN checks.
# The hermetic sandbox can't run configure's test programs due to the
# dynamic linker setup, but we know the answers for x86_64-linux-gnu.
sed -i 's/if test "$cross_compiling" = yes/if test "yes" = yes/' auto/configure

# Vim's real configure is in auto/configure; the wrapper needs autoconf.
# Run it directly with --srcdir so it finds vim.h in the current directory.
# Provide cache variables for all AC_TRY_RUN checks that are now skipped.
bash auto/configure \\
  --srcdir=. \\
  ac_cv_sizeof_int=4 \\
  ac_cv_sizeof_long=8 \\
  ac_cv_sizeof_long_long=8 \\
  ac_cv_sizeof_off_t=8 \\
  ac_cv_sizeof_time_t=8 \\
  ac_cv_sizeof_size_t=8 \\
  ac_cv_sizeof_pid_t=4 \\
  ac_cv_sizeof_uid_t=4 \\
  ac_cv_sizeof_gid_t=4 \\
  vim_cv_toupper_broken=no \\
  vim_cv_terminfo=yes \\
  vim_cv_tgetent=non-zero \\
  vim_cv_getcwd_broken=no \\
  vim_cv_timer_create_works=yes \\
  vim_cv_stat_ignores_slash=no \\
  --prefix=/ \\
  --with-features=huge \\
  --with-tlib=ncursesw \\
  --enable-multibyte \\
  --enable-cscope \\
  --enable-terminal \\
  --enable-fail-if-missing \\
  --disable-nls \\
  --disable-gui \\
  --disable-netbeans \\
  --disable-channel \\
  --disable-selinux \\
  --disable-xsmp \\
  --without-x

make -j$(nproc)
make install DESTDIR=$OUT

# Strip the binaries
/deps/toolchain/bin/strip $OUT/bin/vim 2>/dev/null || true
# Create vi symlink
cd $OUT/bin && ln -sf vim vi

# Remove docs and man pages
rm -rf $OUT/share/man 2>/dev/null || true
# Vim installs a lot of runtime files; keep share/vim (syntax, colors, etc.)
# but remove the tutor translations and docs to save space
rm -rf $OUT/share/vim/vim92/doc 2>/dev/null || true
rm -rf $OUT/share/vim/vim92/tutor 2>/dev/null || true
`,
  deps: [
    dep("source", vimSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("ncurses", ncursesRecipe),
  ],
  runtime_deps: ["ncurses", "toolchain"],
});

await importToStore(recipe);
export const vimRecipe = recipe;
