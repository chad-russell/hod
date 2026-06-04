//! Standard stripping and post-install snippets for Hod recipes.
//!
//! Import these constants and use them in your shellBuild script block
//! to strip binaries and shared libraries consistently, and to make
//! pkg-config files relocatable.
//!
//! Usage:
//!   import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";
//!   shellBuild({
//!     script: `...\nDESTDIR=\$OUT make install\n\${RELOCATE_PKG_CONFIG}\n\${STRIP_ALL}\n`,
//!     ...
//!   });

export const STRIP = "/deps/toolchain/bin/strip";

/** Strip debug symbols from executables in $OUT/bin. */
export const STRIP_BINARIES = `
find $OUT/bin -type f -exec ${STRIP} {} + 2>/dev/null || true
`;

/**
 * Strip unneeded symbols from shared libraries in $OUT/lib.
 *
 * Uses --strip-unneeded (not bare strip) because shared libraries
 * must preserve their dynamic symbol table (.dynsym/.dynstr) for
 * downstream linkers and the relocation pass.
 */
export const STRIP_LIBRARIES = `
find $OUT/lib -name '*.so*' -exec ${STRIP} --strip-unneeded {} + 2>/dev/null || true
`;

/** Strip binaries, shared libraries, and remove doc/man/la clutter. */
export const STRIP_ALL = `
${STRIP_BINARIES}
${STRIP_LIBRARIES}
rm -rf $OUT/share/doc $OUT/share/gtk-doc $OUT/share/man $OUT/lib/*.la 2>/dev/null || true
`;

/**
 * Make pkg-config files relocatable using pcfiledir.
 *
 * Replaces the hardcoded prefix= line in each .pc file with a
 * pcfiledir-relative reference so that pkg-config resolves paths
 * correctly regardless of where the output is installed.
 */
export const RELOCATE_PKG_CONFIG = `
for pc in $OUT/lib/pkgconfig/*.pc $OUT/lib64/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */lib64/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\\\${pcfiledir}/../../..|' "$pc" ;;
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\\\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\\\${pcfiledir}/../..|' "$pc" ;;
  esac
done
`;
