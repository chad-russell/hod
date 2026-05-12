//! tig native build recipe — ncurses-based text-mode interface for git.
//!
//! Builds tig 2.6.0. Dependencies: toolchain, ncurses, readline, libiconv,
//! pcre2 (optional, for regex), autoconf + automake + m4 + perl (for
//! autoreconf to generate configure from configure.ac).
//!
//! ## Build approach
//!
//! Tig ships configure.ac but no pre-generated `configure` script, so we
//! run `autoreconf` first using autoconf + automake. The configure script
//! uses AX_WITH_CURSES and AX_LIB_READLINE macros bundled in `tools/`.
//!
//! We pass --with-ncursesw to prefer wide-character ncurses, and
//! --with-libiconv / --with-readline to point at our store deps. PCRE2
//! support is enabled via CPPFLAGS/LDFLAGS so configure detects it.
//!
//! ## Runtime dependencies
//!
//! tig links against shared ncursesw, readline, and glibc. It also
//! optionally links pcre2 and libiconv.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { ncursesRecipe } from "../ncurses/ncurses.js";
import { readlineRecipe } from "../readline/readline.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { autoconfRecipe } from "../autoconf/autoconf.js";
import { automakeRecipe } from "../automake/automake.js";
import { m4Recipe } from "../m4/m4.js";
import { perlRecipe } from "../perl/perl.js";
import { tigSourceRecipe } from "./tig-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["ncurses", "readline", "libiconv", "pcre2"],
    libDeps: ["ncurses", "readline", "libiconv", "pcre2"],
    pkgConfigDeps: ["ncurses", "readline", "pcre2"],
    binDeps: ["autoconf", "automake", "m4", "perl"],
  }),
  script: `

# Copy source to a writable directory for autoreconf.
cp -a /deps/source/. /tmp/build
cd /tmp/build

# Generate configure from configure.ac using bundled m4 macros.
# aclocal needs to find automake's aclocal dir and the project's tools/ dir.
# Perl modules must be discoverable by autoreconf/autoconf.
export ACLOCAL_PATH="/deps/automake/share/aclocal-1.18:/deps/toolchain/sysroot/share/aclocal"
export PERL5LIB="/deps/perl/lib/perl5/5.40.0:/deps/perl/lib/perl5/5.40.0/x86_64-linux"
autoreconf -v -I tools

# Configure with our dependencies.
# LDFLAGS already includes $HOD_DUMMY_RPATH from cProfile.
# PKG_CONFIG_PATH already set by cProfile for ncurses, readline, pcre2.
export LDFLAGS="$HOD_DUMMY_RPATH -L/deps/readline/lib -L/deps/libiconv/lib"
export CPPFLAGS="-I/deps/readline/include -I/deps/libiconv/include -I/deps/pcre2/include"

./configure \\
  --prefix=/ \\
  --with-ncursesw \\
  --with-readline=/deps/readline \\
  --with-libiconv=/deps/libiconv \\
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

# Strip binary
/deps/toolchain/bin/strip $OUT/bin/tig 2>/dev/null || true

# Remove docs and man pages
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true
rmdir $OUT/share 2>/dev/null || true
`,
  deps: [
    dep("source", tigSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("ncurses", ncursesRecipe),
    dep("readline", readlineRecipe),
    dep("libiconv", libiconvRecipe),
    dep("pcre2", pcre2Recipe),
    dep("autoconf", autoconfRecipe),
    dep("automake", automakeRecipe),
    dep("m4", m4Recipe),
    dep("perl", perlRecipe),
  ],
  runtime_deps: ["libiconv", "ncurses", "pcre2", "readline", "toolchain"],
});

await importToStore(recipe);
export const tigRecipe = recipe;
