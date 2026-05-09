//! zstd native build recipe — Zstandard compression library and tools.
//!
//! Builds zstd 1.5.7, providing libzstd (shared + static library) and the zstd
//! command-line compression/decompression utility. zstd is a modern,
//! fast compression algorithm that is increasingly used as the default
//! compressor in package managers, kernel tools, filesystems, and more.
//!
//! No dependencies beyond the toolchain. Uses zstd's own Makefile-based
//! build system. Dynamically links glibc from the toolchain (relocated
//! via runtime_deps).
//!
//! Output provides: zstd, unzstd, zstdcat, zstdmt, zstdgrep, zstdless.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { zstdSourceRecipe } from "./zstd-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

# Extract source
tar xf /deps/source/source -C /tmp
cd /tmp/zstd-1.5.7

# Build shared + static library and CLI
make -j$(nproc) lib-release LIB_TYPE=dynamic
make -j$(nproc) -C programs zstd-release

# Install library (shared + static)
make -C lib install DESTDIR=$OUT PREFIX=/ LIB_TYPE=dynamic

# Install CLI programs
make -C programs install DESTDIR=$OUT PREFIX=/

# Make pkg-config files relocatable via pcfiledir (pkgconf extension).
for pc in $OUT/lib/pkgconfig/*.pc $OUT/lib64/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */lib64/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../../..|' "$pc" ;;
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

# Strip the binary and shared library
$STRIP $OUT/bin/zstd 2>/dev/null || true
$STRIP $OUT/lib/libzstd.so.*.*.* 2>/dev/null || true

# Fix absolute symlinks created by install — replace with relative
cd $OUT/bin
ln -sf zstd unzstd
ln -sf zstd zstdcat
ln -sf zstd zstdmt

# Clean up — remove docs, man pages, la files. Keep pkgconfig.
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true
rmdir $OUT/share 2>/dev/null || true`,
  deps: [
    dep("source", zstdSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const zstdRecipe = recipe;
