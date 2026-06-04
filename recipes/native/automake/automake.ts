//! automake native build recipe — GNU Automake.
//!
//! Builds automake 1.18.1. Dependencies: autoconf (built), m4 (built), perl (built).
//!
//! Automake is a Perl/shell script package — no compilation. The output
//! consists of scripts (automake, aclocal, etc.) in bin/ and M4 macros in
//! share/automake-1.18/ and share/aclocal-1.18/. No shared libraries.
//!
//! When automake is used as a build dependency, the consuming recipe must
//! also include autoconf, m4, and perl as deps and set PATH so the scripts
//! can find them at runtime. aclocal also needs to find automake's own
//! share/aclocal-1.18/ directory.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { automakeSourceRecipe } from "./automake-source.js";
import { autoconfRecipe } from "../autoconf/autoconf.js";
import { m4Recipe } from "../m4/m4.js";
import { perlRecipe } from "../perl/perl.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile({ binDeps: ["autoconf", "m4", "perl"] }),
  sourceDir: true,
  script: `
# Make autoconf, m4, and perl discoverable by configure
export PATH="/deps/autoconf/bin:/deps/m4/bin:/deps/perl/bin:$PATH"

# Perl was built with --prefix=/, so its modules live at
# lib/perl5/5.40.0/. Point PERL5LIB there so automake/aclocal
# scripts can find strict.pm, Fcntl.pm, etc.
export PERL5LIB="/deps/perl/lib/perl5/5.40.0:/deps/perl/lib/perl5/5.40.0/x86_64-linux"

# Set AUTOCONF to the exact path so configure finds it
export AUTOCONF=/deps/autoconf/bin/autoconf
export AUTOM4TE=/deps/autoconf/bin/autom4te

./configure \\
  --prefix=/

make -j$(nproc)
make install DESTDIR=$OUT

# No binaries to strip — automake is all scripts.

# Patch hardcoded paths so scripts work when used as /deps/automake.
# --prefix=/ produces references like //share/automake-1.18,
# //share/aclocal-1.18, //bin/automake, etc.
# Replace all //share/ and //bin/ with /deps/automake/ paths.
sed -i 's|//share/|/deps/automake/share/|g; s|//bin/|/deps/automake/bin/|g' \
  $OUT/bin/* $OUT/share/automake-1.18/Automake/Config.pm

# Clean up — remove docs, man, info. Keep share/automake-1.18 (M4 macros)
# and share/aclocal-1.18 (aclocal macros) for downstream builds.
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/share/emacs 2>/dev/null || true

# Verify key outputs exist
ls -la $OUT/bin/automake $OUT/bin/aclocal
ls -la $OUT/share/automake-1.18/Automake/Config.pm
ls -la $OUT/share/aclocal-1.18/
`,
  deps: [
    dep("source", automakeSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("autoconf", autoconfRecipe),
    dep("m4", m4Recipe),
    dep("perl", perlRecipe),
  ],
  // No runtime_deps — automake produces no compiled binaries or shared
  // libraries. The scripts need autoconf, m4, and perl, which must be
  // provided by whatever recipe uses automake as a dep.
});

await importToStore(recipe);
export const automakeRecipe = recipe;
