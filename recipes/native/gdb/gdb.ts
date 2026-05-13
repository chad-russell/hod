//! GDB native build recipe — GNU Debugger.
//!
//! Builds GDB 17.2 with Python scripting support, TUI (curses interface),
//! and all optional features that have dependencies available in the store.
//!
//! GDB comes from the binutils-gdb combined source tree. We configure at the
//! top level (needed so BFD and other subprojects configure correctly), but
//! only install the gdb and gdbserver subdirectories.
//!
//! Mandatory deps: GMP, MPFR (via bfd/sim).
//! Optional deps enabled: Python, Readline (system), ncurses (TUI),
//!   expat (XML target descriptions), zlib (compressed debug sections),
//!   xz/liblzma (LZMA compressed debug sections).
//!
//! Key configure notes:
//!   - --with-system-readline: use our built readline (not the bundled one)
//!   - --with-system-zlib: use our built zlib (not the bundled one)
//!   - --with-python: needs to find python3 binary + libpython
//!   - C++17 compiler required (provided by our gcc-stage2 toolchain)
//!   - We use a build directory separate from source (recommended practice)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { gdbSourceRecipe } from "./gdb-source.js";
import { gmpRecipe } from "../gmp/gmp.js";
import { mpfrRecipe } from "../mpfr/mpfr.js";
import { pythonRecipe } from "../python/python.js";
import { ncursesRecipe } from "../ncurses/ncurses.js";
import { readlineRecipe } from "../readline/readline.js";
import { expatRecipe } from "../expat/expat.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { xzRecipe } from "../xz/xz.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  // GDB is C++17 — cProfile() only sets CC, not CXX.
  // We need to add CXX to the env from cProfile without overwriting it.
  // Use a computed approach: get cProfile result, then merge CXX into its env.
  ...((() => {
    const base = cProfile({
      includeDeps: ["gmp", "mpfr", "python", "ncurses", "readline", "expat", "zlib", "xz"],
      includePaths: ["/deps/ncurses/include/ncursesw"],
      libDeps: ["gmp", "mpfr", "python", "ncurses", "readline", "expat", "zlib", "xz"],
      pkgConfigDeps: ["gmp", "mpfr", "ncurses", "readline", "expat", "zlib", "xz"],
    });
    return {
      ...base,
      env: {
        ...base.env!,
        CXX: "/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin",
      },
    };
  })()),
  script: `

# Copy source to a working directory
cp -a /deps/source/. /tmp/src

# Build in a separate directory (recommended for binutils-gdb)
mkdir /tmp/build
cd /tmp/build

# Point at all dependency headers and libraries.
export CPPFLAGS="-I/deps/gmp/include -I/deps/mpfr/include -I/deps/python/include/python3.13 -I/deps/ncurses/include -I/deps/ncurses/include/ncursesw -I/deps/readline/include -I/deps/expat/include -I/deps/zlib/include -I/deps/xz/include"

export LDFLAGS="$HOD_DUMMY_RPATH -L/deps/gmp/lib -L/deps/mpfr/lib -L/deps/python/lib -L/deps/ncurses/lib -L/deps/readline/lib -L/deps/expat/lib -L/deps/zlib/lib -L/deps/xz/lib"

export PKG_CONFIG_PATH="/deps/gmp/lib/pkgconfig:/deps/mpfr/lib/pkgconfig:/deps/ncurses/lib/pkgconfig:/deps/readline/lib/pkgconfig:/deps/expat/lib/pkgconfig:/deps/zlib/lib/pkgconfig:/deps/xz/lib/pkgconfig"

# Allow configure test programs and build artifacts to find shared libs at runtime.
export LD_LIBRARY_PATH="/deps/gmp/lib:/deps/mpfr/lib:/deps/python/lib:/deps/ncurses/lib:/deps/readline/lib:/deps/expat/lib:/deps/zlib/lib:/deps/xz/lib"

# Add Python to PATH so --with-python=python3 finds it
export PATH="/deps/python/bin:$PATH"

# Configure at the top level (needed for BFD, opcodes, etc. subprojects)
# but we'll only build/install the gdb subdirectory.
# Note: --enable-targets=all builds a GDB that can debug any architecture.
../src/configure \\
  --prefix=/ \\
  --disable-werror \\
  --disable-nls \\
  --with-system-readline \\
  --with-system-zlib \\
  --with-python=python3 \\
  --with-gmp=/deps/gmp \\
  --with-mpfr=/deps/mpfr \\
  --with-expat \\
  --with-libexpat-prefix=/deps/expat \\
  --with-liblzma-prefix=/deps/xz \\
  --with-libiconv-prefix=no \\
  --enable-tui \\
  --disable-gdbserver \\
  --disable-gdb-build-index \\
  --enable-targets=all

make -j$(nproc) all-gdb

# Install only the gdb subdirectory
make install-gdb DESTDIR=$OUT

# Strip the gdb binary
/deps/toolchain/bin/strip $OUT/bin/gdb 2>/dev/null || true

# Clean up
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info 2>/dev/null || true

# Remove system-gdbinit if it has an empty/default content
rm -f $OUT/share/gdb/system-gdbinit.el 2>/dev/null || true

# Keep share/gdb for Python scripts and data files needed at runtime.
# Remove only truly unnecessary subdirectories.
rm -rf $OUT/share/gdb/gui 2>/dev/null || true
rm -rf $OUT/share/gdb/python/gdb/printer 2>/dev/null || true
`,
  deps: [
    dep("source", gdbSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("gmp", gmpRecipe),
    dep("mpfr", mpfrRecipe),
    dep("python", pythonRecipe),
    dep("ncurses", ncursesRecipe),
    dep("readline", readlineRecipe),
    dep("expat", expatRecipe),
    dep("zlib", zlibRecipe),
    dep("xz", xzRecipe),
  ],
  runtime_deps: ["expat", "gmp", "mpfr", "ncurses", "python", "readline", "toolchain", "xz", "zlib"],
});

await importToStore(recipe);
export const gdbRecipe = recipe;
