//! bzip2 native build recipe — high-quality data compressor and library.
//!
//! Builds bzip2 1.0.8 with shared library output (libbz2.so*) and static archive.
//! bzip2 has no built-in shared-lib support in its Makefile, so we build the
//! shared library manually from -fPIC objects.
//!
//! No dependencies beyond the toolchain. Dynamically links glibc from the
//! toolchain (relocated via runtime_deps).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { bzip2SourceRecipe } from "./bzip2-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

CFLAGS="-Wall -Winline -O2 -D_FILE_OFFSET_BITS=64"
LDFLAGS="$HOD_DUMMY_RPATH"

# Compile objects with -fPIC for shared library
for src in blocksort.c huffman.c crctable.c randtable.c compress.c decompress.c bzlib.c; do
  $CC $CFLAGS -fPIC -c $src
done

# Build shared library
$CC -shared -Wl,-soname,libbz2.so.1.0 -o libbz2.so.1.0.8 blocksort.o huffman.o crctable.o randtable.o compress.o decompress.o bzlib.o $LDFLAGS -lc
ln -sf libbz2.so.1.0.8 libbz2.so.1.0
ln -sf libbz2.so.1.0.8 libbz2.so.1
ln -sf libbz2.so.1.0.8 libbz2.so

# Build static library
$AR cq libbz2.a blocksort.o huffman.o crctable.o randtable.o compress.o decompress.o bzlib.o
$RANLIB libbz2.a

# Compile and build executables linked against shared lib
$CC $CFLAGS -c bzip2.c
$CC $CFLAGS -c bzip2recover.c
$CC $CFLAGS -o bzip2 bzip2.o -L. -lbz2 $LDFLAGS
$CC $CFLAGS -o bzip2recover bzip2recover.o $LDFLAGS

# Install
mkdir -p $OUT/bin $OUT/lib $OUT/include

cp bzip2 $OUT/bin/
cp bzip2recover $OUT/bin/
chmod 755 $OUT/bin/bzip2 $OUT/bin/bzip2recover

cp bzlib.h $OUT/include/
chmod 644 $OUT/include/bzlib.h

cp libbz2.a $OUT/lib/
chmod 644 $OUT/lib/libbz2.a

cp libbz2.so.1.0.8 $OUT/lib/
chmod 755 $OUT/lib/libbz2.so.1.0.8
cd $OUT/lib
ln -sf libbz2.so.1.0.8 libbz2.so.1.0
ln -sf libbz2.so.1.0.8 libbz2.so.1
ln -sf libbz2.so.1.0.8 libbz2.so

# Fix absolute symlinks in bin — replace with relative symlinks
cd $OUT/bin
ln -sf bzip2 bunzip2
ln -sf bzip2 bzcat

# Install helper scripts and their symlinks
cd /tmp/build
cp bzgrep bzdiff bzmore $OUT/bin/
chmod 755 $OUT/bin/bzgrep $OUT/bin/bzdiff $OUT/bin/bzmore
cd $OUT/bin
ln -sf bzgrep bzegrep
ln -sf bzgrep bzfgrep
ln -sf bzdiff bzcmp
ln -sf bzmore bzless

# Strip binaries
$STRIP $OUT/bin/bzip2 $OUT/bin/bzip2recover 2>/dev/null || true

mkdir -p $OUT/lib/pkgconfig

# Create pkg-config file
cat > $OUT/lib/pkgconfig/bzip2.pc << 'PCEOF'
prefix=/
exec_prefix=\${prefix}
libdir=\${exec_prefix}/lib
includedir=\${prefix}/include

Name: bzip2
Description: A file compression library
Version: 1.0.8
Libs: -L\${libdir} -lbz2
Cflags: -I\${includedir}
PCEOF

# Make pkg-config files relocatable via pcfiledir (pkgconf extension).
for pc in $OUT/lib/pkgconfig/*.pc $OUT/lib64/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */lib64/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../../..|' "$pc" ;;
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

# Remove man pages
rm -rf $OUT/man 2>/dev/null || true`,
  deps: [
    dep("source", bzip2SourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const bzip2Recipe = recipe;
