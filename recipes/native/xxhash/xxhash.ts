//! xxHash native build recipe — extremely fast non-cryptographic hash algorithm.
//!
//! Builds xxHash 0.8.3, providing libxxhash (shared + static library) and the
//! xxhsum command-line checksum tool. xxHash provides XXH3, XXH64, XXH32, and
//! XXH128 hash algorithms at RAM-speed limits, widely used as a library
//! dependency and standalone checksum utility.
//!
//! No dependencies beyond the toolchain. Uses xxHash's own Makefile-based build
//! system. Dynamically links glibc from the toolchain (relocated via
//! runtime_deps).
//!
//! Output provides: xxhsum, xxh32sum, xxh64sum, xxh128sum, xxh3sum,
//! libxxhash.so, libxxhash.a, and pkg-config metadata.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { xxhashSourceRecipe } from "./xxhash-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# Build shared + static library and CLI
make -j$(nproc) LIB_TYPE=dynamic

# Install everything (library, headers, CLI, pkg-config)
make install DESTDIR=$OUT PREFIX=/ PKGCONFIGDIR=/lib/pkgconfig

# Make pkg-config files relocatable via pcfiledir (pkgconf extension).
for pc in $OUT/lib/pkgconfig/*.pc $OUT/lib64/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */lib64/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../../..|' "$pc" ;;
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

# Strip binaries and shared library
find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
/deps/toolchain/bin/strip $OUT/lib/libxxhash.so.*.*.* 2>/dev/null || true

# Clean up — remove docs, man pages, la files. Keep pkgconfig.
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true
rmdir $OUT/share 2>/dev/null || true
`,
  deps: [
    dep("source", xxhashSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const xxhashRecipe = recipe;
