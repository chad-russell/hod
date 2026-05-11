//! autoconf native build recipe — GNU Autoconf.
//!
//! Builds autoconf 2.73. Dependencies: m4 (built), perl (built).
//!
//! Autoconf is a Perl/shell script package — no compilation. The output
//! consists of scripts (autoconf, autoreconf, autoheader, etc.) in bin/
//! and M4 macros in share/autoconf/. No shared libraries are produced.
//!
//! When autoconf is used as a build dependency, the consuming recipe must
//! also include m4 and perl as deps and set PATH so the scripts can find
//! them at runtime.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { autoconfSourceRecipe } from "./autoconf-source.js";
import { m4Recipe } from "../m4/m4.js";
import { perlRecipe } from "../perl/perl.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile({ binDeps: ["m4", "perl"] }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# Make m4 and perl discoverable by configure
export PATH="/deps/m4/bin:/deps/perl/bin:$PATH"

# Perl was built with --prefix=/, so its modules live at
# lib/perl5/5.40.0/. Point PERL5LIB there so autom4te can find
# strict.pm, Fcntl.pm, etc. during the freeze step.
export PERL5LIB="/deps/perl/lib/perl5/5.40.0:/deps/perl/lib/perl5/5.40.0/x86_64-linux"

./configure \\
  --prefix=/

make -j$(nproc)
make install DESTDIR=$OUT

# No binaries to strip — autoconf is all scripts.

# Patch hardcoded paths so scripts work when used as /deps/autoconf.
# --prefix=/ produces //bin and //share/autoconf references.
# Replace with /deps/autoconf/ paths (the standard dep mount point).
sed -i 's|//share/autoconf|/deps/autoconf/share/autoconf|g' \
  $OUT/bin/autoconf $OUT/bin/autoheader $OUT/bin/autom4te \
  $OUT/bin/autoreconf $OUT/bin/autoscan $OUT/bin/autoupdate $OUT/bin/ifnames \
  $OUT/share/autoconf/autom4te.cfg
sed -i 's|//bin/autom4te|/deps/autoconf/bin/autom4te|g' \
  $OUT/bin/autoconf $OUT/bin/autoheader $OUT/bin/autoreconf \
  $OUT/bin/autoscan $OUT/bin/autoupdate
# Fix remaining //bin/ references (autoconf, autoheader, autoreconf, etc.)
sed -i 's|//bin/autoconf|/deps/autoconf/bin/autoconf|g; s|//bin/autoheader|/deps/autoconf/bin/autoheader|g; s|//bin/autoreconf|/deps/autoconf/bin/autoreconf|g; s|//bin/autoscan|/deps/autoconf/bin/autoscan|g; s|//bin/autoupdate|/deps/autoconf/bin/autoupdate|g; s|//bin/ifnames|/deps/autoconf/bin/ifnames|g' \
  $OUT/bin/*

# Clean up — remove docs and info. Keep share/autoconf (M4 macros).
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/share/emacs 2>/dev/null || true

# Verify key outputs exist
ls -la $OUT/bin/autoconf $OUT/bin/autoreconf $OUT/bin/autoheader $OUT/bin/autom4te
ls -la $OUT/share/autoconf/autom4te.cfg
`,
  deps: [
    dep("source", autoconfSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("m4", m4Recipe),
    dep("perl", perlRecipe),
  ],
  // No runtime_deps — autoconf produces no compiled binaries or shared
  // libraries. The scripts need m4 and perl, which must be provided by
  // whatever recipe uses autoconf as a dep.
});

await importToStore(recipe);
export const autoconfRecipe = recipe;
