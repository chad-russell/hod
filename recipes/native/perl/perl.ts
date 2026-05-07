//! perl native build recipe — minimal perl for build system support.
//!
//! Builds perl using the bootstrap toolchain (gcc-stage1) so it can be
//! included in the native-toolchain bundle without a circular dependency.
//!
//! Only installs the perl binary and minimal core modules needed to run
//! OpenSSL's Configure and similar build systems.
import { process, dep, importToStore, hermeticPreamble } from "../../../js/src/index.js";
import { hodSeedRootRecipe } from "../../bootstrap/hod-seed-root.js";
import { shimsBundleRecipe } from "../../shims/shims-bundle.js";
import { gccStage1Recipe } from "../../cross/gcc-stage1.js";
import { glibcRecipe } from "../../cross/glibc.js";
import { linuxHeadersRecipe } from "../../cross/linux-headers.js";
import { perlSourceRecipe } from "./perl-source.js";

const preamble = hermeticPreamble({
  shell: "seed",
  muslLinker: "seed",
  glibcLinker: "glibc",
  sysroot: { glibc: "glibc", linuxHeaders: "linux-headers" },
});

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

# Extract source
tar xf /deps/source/source -C /tmp
cd /tmp/perl-5.40.0

# Set up cross-compilation tools on PATH
export PATH=/deps/gcc-stage1/bin:/deps/seed/bin:/deps/shims/bin

# Perl's Configure needs 'cpp' (the C preprocessor). GCC installs it as
# x86_64-linux-gnu-cpp but Configure looks for just 'cpp'.
# Create a wrapper script that uses 'gcc -E' as the preprocessor.
mkdir -p /tmp/cross-bin
cat > /tmp/cross-bin/cpp << 'CPPEOF'
#!/bin/sh
exec x86_64-linux-gnu-gcc --sysroot=/tmp/sysroot -B/deps/seed/bin/ -E "$@"
CPPEOF
chmod +x /tmp/cross-bin/cpp
export PATH=/tmp/cross-bin:$PATH

# Build a minimal static perl.
# -Dprefix=/              → install to $OUT with DESTDIR
# -Dusedl=false           → no dynamic loading (static perl)
# -Dusethreads=false      → no threading (simpler)
# -Dlibs='-lm -lpthread'  → only link what's available in the sysroot
# Various -Dcf_* and -Da_* flags answer questions Configure would ask
# to avoid interactive prompts on missing features.
./Configure -des \\
  -Dprefix=/ \\
  -Dcc="x86_64-linux-gnu-gcc --sysroot=/tmp/sysroot -B/deps/seed/bin/" \\
  -Dld="x86_64-linux-gnu-gcc --sysroot=/tmp/sysroot -B/deps/seed/bin/" \\
  -Dccflags="-O2" \\
  -Dldflags="-static -L/deps/gcc-stage1/lib -L/deps/gcc-stage1/lib/gcc/x86_64-linux-gnu/13.2.0" \\
  -Dlibs="-lm -lpthread" \\
  -Dusedl=false \\
  -Dusethreads=false \\
  -Duse64bitint=true \\
  -Dcf_email="nodobody@example.com" \\
  -Dperladmin="nobody@example.com" \\
  -Dd_crypt=false \\
  -Di_db=false \\
  -Accflags="-DNO_LOCALE" \\
  -Dnoextensions="DB_File GDBM_File NDBM_File ODBM_File SDBM_File IPC::SysV Sys::Syslog Math::BigInt::FastCalc I18N::Langinfo Amiga::ARexx Amiga::Exec"

make -j$(nproc)
make install DESTDIR=$OUT

# Strip the perl binary
/deps/seed/bin/strip $OUT/bin/perl 2>/dev/null || true

# Remove unnecessary files to keep the output small
rm -rf $OUT/share/man 2>/dev/null || true`,
  ],
  env: [
    { key: "C_INCLUDE_PATH", value: "/deps/gcc-stage1/include:/deps/glibc/include:/deps/linux-headers/include" },
    { key: "LIBRARY_PATH", value: "/deps/glibc/lib:/deps/gcc-stage1/lib:/deps/gcc-stage1/lib/gcc/x86_64-linux-gnu/13.2.0" },
  ],
  dependencies: [
    dep("gcc-stage1", gccStage1Recipe),
    dep("glibc", glibcRecipe),
    dep("linux-headers", linuxHeadersRecipe),
    dep("seed", hodSeedRootRecipe),
    dep("shims", shimsBundleRecipe),
    dep("source", perlSourceRecipe),
  ],
});

await importToStore(recipe);
export const perlRecipe = recipe;
