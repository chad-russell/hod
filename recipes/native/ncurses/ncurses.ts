//! ncurses recipe — static widechar build for use by downstream packages.
//!
//! Builds ncurses 6.6 with wide character support (ncursesw) and static libs.
//! Also creates non-widec compatibility symlinks so packages looking for
//! -lncurses can find the widechar version.
//!
//! Run with: bun run recipes/native/ncurses/ncurses.ts

import {
  process,
  dep,
  download,
  writeHod,
  writeJson,
  fromJson,
  type BuiltRecipe,
} from "../../../js/src/index.js";

const dir = import.meta.dir;

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

// ncurses source tarball
const source: BuiltRecipe = await download({
  url: "https://invisible-island.net/archives/ncurses/ncurses-6.6.tar.gz",
  hash: "fbec55697a01f99b9cc3f25be55e73ae7091f4c53e5d81a1ea15734c4e5b7238",
});

// Static make from shims (built with seed toolchain only, no glibc)
const make: BuiltRecipe = await fromJson(`${dir}/../../shims/make.json`);

// Bootstrap seed toolchain
const seed: BuiltRecipe = await fromJson(`${dir}/../../bootstrap/seed-root.json`);

// ---------------------------------------------------------------------------
// ncurses build recipe
// ---------------------------------------------------------------------------

const ncurses = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

# Ensure /bin/sh exists for configure scripts with #!/bin/sh shebangs
mkdir -p /bin
ln -sf /deps/seed/bin/busybox /bin/sh

tar xf /deps/source/source -C /tmp
cd /tmp/ncurses-6.6

CC=/deps/seed/bin/gcc \\
AR=/deps/seed/bin/ar \\
RANLIB=/deps/seed/bin/ranlib \\
CFLAGS="-O2" \\
LDFLAGS="-static" \\
sh ./configure \\
  --prefix=/ \\
  --disable-shared \\
  --enable-static \\
  --enable-widec \\
  --without-debug \\
  --without-ada \\
  --without-manpages \\
  --without-tests \\
  --without-cxx-binding \\
  --disable-stripping

/deps/make/bin/make -j$(nproc)
/deps/make/bin/make install DESTDIR=$OUT

# Create non-widec compatibility symlinks so cbonsai's Makefile can find -lncurses
cd $OUT/lib
for f in libncursesw*; do
  ln -sf "$f" "$(echo "$f" | sed 's/w//')"
done
if [ -d $OUT/lib/pkgconfig ]; then
  cd $OUT/lib/pkgconfig
  for f in *.pc; do
    ln -sf "$f" "$(echo "$f" | sed 's/w//')"
  done
fi`,
  ],
  env: { PATH: "/deps/seed/bin:/deps/make/bin" },
  dependencies: [
    dep("make", make),
    dep("seed", seed),
    dep("source", source),
  ],
});

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

await writeHod(ncurses, `${dir}/ncurses-from-ts.hod`);
writeJson(ncurses, `${dir}/ncurses-from-ts.json`);

console.log(`ncurses hash: ${ncurses.hash}`);

export const ncursesRecipe = ncurses;
