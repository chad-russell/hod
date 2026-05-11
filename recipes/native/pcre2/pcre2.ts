//! pcre2 native build recipe — Perl-compatible regular expression library.
//!
//! Builds PCRE2 10.47. Standalone autotools build, zero deps beyond
//! toolchain. Produces libpcre2-8.so and pcre2grep CLI.
//!
//! Dynamically links glibc (relocated via runtime_deps).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { pcre2SourceRecipe } from "./pcre2-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-dependency-tracking \\
  --enable-pcre2-8 \\
  --disable-pcre2-16 \\
  --disable-pcre2-32 \\
  --disable-dependency-tracking

make -j$(nproc)
make install DESTDIR=$OUT

# Make pkg-config files relocatable via pcfiledir (pkgconf extension).
for pc in $OUT/lib/pkgconfig/*.pc $OUT/lib64/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */lib64/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../../..|' "$pc" ;;
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

# Strip binaries
find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true

# Clean up — remove docs, man, la files. Keep pkgconfig for downstream.
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true

# Verify key outputs
ls -la $OUT/bin/pcre2grep
ls -la $OUT/lib/libpcre2-8.so
ls -la $OUT/lib/pkgconfig/libpcre2-8.pc
`,
  deps: [
    dep("source", pcre2SourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const pcre2Recipe = recipe;
