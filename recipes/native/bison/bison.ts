//! bison native build recipe — GNU parser generator.
//!
//! Builds GNU Bison 3.8.2. Dependencies: m4 (built).
//! Dynamically links glibc (relocated via runtime_deps).
//!
//! Bison produces the `bison` binary and `yacc` wrapper, plus M4 skeleton
//! files in share/bison/ that are needed at build time by downstream
//! packages that use bison to generate parsers.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { bisonSourceRecipe } from "./bison-source.js";
import { m4Recipe } from "../m4/m4.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile({ binDeps: ["m4"] }),
  sourceDir: true,
  script: `
# Make m4 discoverable by configure
export PATH="/deps/m4/bin:$PATH"
export M4="/deps/m4/bin/m4"

./configure \\
  --prefix=/ \\
  --disable-nls \\
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

# Strip the real binary, then move it out of bin/ so we can install a
# package-specific wrapper. Bison supports BISON_PKGDATADIR and M4 env vars;
# use those instead of patching compiled-in strings in the ELF.
${STRIP} $OUT/bin/bison 2>/dev/null || true
mkdir -p $OUT/libexec/bison
mv $OUT/bin/bison $OUT/libexec/bison/bison

# Bake the canonical runtime location of the m4 dependency into the wrapper.
# This is store-shape relative, so it works both in sandboxes (/xx/hash) and
# from a host/transfer staging root (.../staging/xx/hash).
m4_abs="$(readlink -f /deps/m4)"
m4_store_path="\${m4_abs#/store/staging/}"

cat > $OUT/bin/bison <<'EOF'
#!/bin/sh
case "\$0" in
    /*) _self="\$0" ;;
    *)  _self="\$(pwd)/\$0" ;;
esac
bin_dir="\${_self%/*}"
prefix="\$(cd "\$bin_dir/.." && pwd -P)"
staging_root="\$(cd "\$bin_dir/../../.." && pwd -P)"
export BISON_PKGDATADIR="\${BISON_PKGDATADIR:-\$prefix/share/bison}"
if [ -z "\${M4+x}" ]; then
  export M4="\$staging_root/@M4_STORE_PATH@/bin/m4"
fi
exec "\$prefix/libexec/bison/bison" "\$@"
EOF
sed -i "s|@M4_STORE_PATH@|$m4_store_path|g" $OUT/bin/bison
chmod +x $OUT/bin/bison

# Fix absolute symlinks
cd $OUT/bin
ln -sf bison yacc

# Clean up — remove docs and info. Keep share/bison (skeleton files) and share/aclocal.
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true

# Verify key outputs
ls -la $OUT/bin/bison $OUT/bin/yacc
ls -la $OUT/share/bison/skeletons/bison.m4
`,
  deps: [
    dep("source", bisonSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("m4", m4Recipe),
  ],
  runtime_deps: ["m4", "toolchain"],
});

await importToStore(recipe);
export const bisonRecipe = recipe;
