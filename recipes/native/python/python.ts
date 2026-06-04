//! python native build recipe — the CPython interpreter and standard library.
//!
//! Builds Python 3.13.13 with shared libpython and a comprehensive set of
//! extension modules. Dynamically links shared openssl, zlib, libffi, ncurses,
//! readline, bzip2, xz, expat from the store (all relocated via runtime_deps).
//!
//! Modules built: _ssl, _hashlib, zlib, _ctypes, _curses, _curses_panel,
//! readline, _bz2, _lzma, pyexpat, _elementtree, _decimal (bundled mpdecimal).
//!
//! Modules not built (missing deps): _sqlite3, _uuid, _tkinter, _gdbm, _dbm.
//!
//! Key build note: Python's configure uses PKG_CHECK_MODULES (pkg-config) for
//! many dependencies. The library .pc files use pcfiledir to resolve to correct
//! sandbox paths. We pre-set the _CFLAGS and _LIBS variables on the configure
//! command line for modules where explicit control is needed (e.g., _curses
//! uses AC_CHECK_HEADERS which needs CPPFLAGS). PKG_CHECK_MODULES respects
//! pre-set values as cached answers.
//!
//! Dependencies:
//!   - openssl (TLS/SSL) — _ssl, _hashlib
//!   - zlib (compression) — zlib, binascii
//!   - libffi (ctypes) — _ctypes
//!   - ncurses (terminal) — _curses, _curses_panel
//!   - readline (line editing) — readline
//!   - bzip2 (compression) — _bz2
//!   - xz/liblzma (compression) — _lzma
//!   - expat (XML parsing) — pyexpat, _elementtree

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { pythonSourceRecipe } from "./python-source.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { ncursesRecipe } from "../ncurses/ncurses.js";
import { readlineRecipe } from "../readline/readline.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { xzRecipe } from "../xz/xz.js";
import { expatRecipe } from "../expat/expat.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_BINARIES, STRIP_LIBRARIES } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["openssl", "zlib", "libffi", "ncurses", "readline", "bzip2", "xz", "expat"],
    includePaths: ["/deps/ncurses/include/ncursesw"],
    libDeps: ["openssl", "zlib", "libffi", "ncurses", "readline", "bzip2", "xz", "expat"],
    pkgConfigDeps: ["openssl", "zlib", "libffi", "ncurses", "bzip2", "xz", "expat"],
  }),
  sourceDir: true,
  script: `

# Set PKG_CONFIG_PATH so configure's PKG_CHECK_MODULES can find all deps.
export PKG_CONFIG_PATH="/deps/openssl/lib/pkgconfig:/deps/zlib/lib/pkgconfig:/deps/libffi/lib/pkgconfig:/deps/ncurses/lib/pkgconfig:/deps/bzip2/lib/pkgconfig:/deps/xz/lib/pkgconfig:/deps/expat/lib/pkgconfig"

# Point at all dependency headers and libraries.
# ncursesw headers are in include/ncursesw/ (curses.h, ncurses.h).
# readline headers are in include/readline/ (readline.h).
export CPPFLAGS="-I/deps/openssl/include -I/deps/zlib/include -I/deps/libffi/include -I/deps/ncurses/include -I/deps/ncurses/include/ncursesw -I/deps/readline/include -I/deps/bzip2/include -I/deps/xz/include -I/deps/expat/include"

export LDFLAGS="$HOD_DUMMY_RPATH -L/deps/openssl/lib -L/deps/zlib/lib -L/deps/libffi/lib -L/deps/ncurses/lib -L/deps/readline/lib -L/deps/bzip2/lib -L/deps/xz/lib -L/deps/expat/lib"

# Bypass pkg-config for all deps. Python's configure uses PKG_CHECK_MODULES
# which checks if <VAR>_CFLAGS and <VAR>_LIBS are already set in the env.
# If so, it uses them instead of running pkg-config. This avoids the problem
# where pkg-config returns paths relative to prefix / which don't exist in
# the hermetic sandbox (deps are at /deps/<name>/).
export ZLIB_CFLAGS="-I/deps/zlib/include"
export ZLIB_LIBS="-L/deps/zlib/lib -lz"

export BZIP2_CFLAGS="-I/deps/bzip2/include"
export BZIP2_LIBS="-L/deps/bzip2/lib -lbz2"

export LIBLZMA_CFLAGS="-I/deps/xz/include"
export LIBLZMA_LIBS="-L/deps/xz/lib -llzma"

export LIBFFI_CFLAGS="-I/deps/libffi/include"
export LIBFFI_LIBS="-L/deps/libffi/lib -lffi"

export CURSES_CFLAGS="-I/deps/ncurses/include/ncursesw"
export CURSES_LIBS="-L/deps/ncurses/lib -lncursesw"

export PANEL_CFLAGS="-I/deps/ncurses/include/ncursesw"
export PANEL_LIBS="-L/deps/ncurses/lib -lpanelw"

export LIBREADLINE_CFLAGS="-I/deps/readline/include"
export LIBREADLINE_LIBS="-L/deps/readline/lib -lreadline"

export LIBEXPAT_CFLAGS="-I/deps/expat/include"
export LIBEXPAT_LIBS="-L/deps/expat/lib -lexpat"

# Allow compiled test programs and the built Python interpreter to find
# shared libraries at runtime during configure and make.
export LD_LIBRARY_PATH="/deps/openssl/lib:/deps/zlib/lib:/deps/libffi/lib:/deps/ncurses/lib:/deps/readline/lib:/deps/bzip2/lib:/deps/xz/lib:/deps/expat/lib"

# Configure Python:
#   --enable-shared           build libpython3.13.so
#   --without-ensurepip       no bundled pip (needs network)
#   --with-openssl            TLS/SSL support
#   --with-system-expat       use our expat for XML
#   --without-system-libmpdec use bundled mpdecimal (we don't have mpdec packaged)
#   --disable-test-modules    skip building test modules (saves time/space)
./configure \\
  --prefix=/ \\
  --enable-shared \\
  --without-ensurepip \\
  --with-openssl=/deps/openssl \\
  --with-system-expat \\
  --without-system-libmpdec \\
  --disable-test-modules

make -j$(nproc)
make install DESTDIR=$OUT

${STRIP_BINARIES}
${STRIP_LIBRARIES}
find $OUT/lib/python3.13/lib-dynload -name '*.so' -type f -exec /deps/toolchain/bin/strip --strip-unneeded {} + 2>/dev/null || true

# Create python -> python3 symlink
cd $OUT/bin && ln -sf python3 python 2>/dev/null || true

# Clean up _sysconfigdata build paths (replace with harmless placeholder)
sed -i "s|/tmp/Python-3.13.13|/no-such-path|g" $OUT/lib/python3.13/_sysconfigdata_*.py 2>/dev/null || true

# Remove idle, turtledemo, and other unnecessary bits
rm -rf $OUT/lib/python3.13/idlelib 2>/dev/null || true
rm -rf $OUT/lib/python3.13/turtledemo 2>/dev/null || true
rm -f $OUT/bin/idle* 2>/dev/null || true

# Remove docs and man pages
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info 2>/dev/null || true

# Keep share/ only if it has useful content (aclocal, etc.)
find $OUT/share -type f 2>/dev/null | grep -q . || rm -rf $OUT/share 2>/dev/null || true
`,
  deps: [
    dep("source", pythonSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("openssl", opensslRecipe),
    dep("zlib", zlibRecipe),
    dep("libffi", libffiRecipe),
    dep("ncurses", ncursesRecipe),
    dep("readline", readlineRecipe),
    dep("bzip2", bzip2Recipe),
    dep("xz", xzRecipe),
    dep("expat", expatRecipe),
  ],
  runtime_deps: ["bzip2", "expat", "libffi", "ncurses", "openssl", "readline", "toolchain", "xz", "zlib"],
});

await importToStore(recipe);
export const pythonRecipe = recipe;
