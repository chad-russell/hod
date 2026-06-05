//! e2fsprogs build recipe — ext2 partition attribute library.
//!
//! Builds only the e2p library and headers from e2fsprogs 1.47.4. ostree
//! needs the e2p header for filesystem feature detection but does not link
//! against the library.
//!
//! Builds the full tree but installs only lib/e2p output (static lib,
//! headers, pkg-config file).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { e2fsprogsSourceRecipe } from "./e2fsprogs-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL } from "../../helpers/strip.js";

export const e2fsprogsRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `
./configure \\
  --prefix=/ \\
  --disable-nls \\
  --disable-backtrace \\
  --disable-debugfs \\
  --disable-imager \\
  --disable-resizer \\
  --disable-defrag \\
  --disable-uuidd \\
  --disable-mmp \\
  --disable-tdb \\
  --disable-fuse2fs \\
  --disable-testio-debug \\
  --without-libarchive

make -j$(nproc)
make install DESTDIR=$OUT

# Keep only e2p + ext2fs output (headers + static libs + pc files)
mkdir -p /tmp/e2p-out/include /tmp/e2p-out/lib/pkgconfig
cp -a $OUT/include/e2p /tmp/e2p-out/include/ 2>/dev/null || true
cp -a $OUT/include/ext2fs /tmp/e2p-out/include/ 2>/dev/null || true
cp -a $OUT/lib/libe2p.a /tmp/e2p-out/lib/ 2>/dev/null || true
cp -a $OUT/lib/libext2fs.a /tmp/e2p-out/lib/ 2>/dev/null || true
cp -a $OUT/lib/pkgconfig/e2p.pc /tmp/e2p-out/lib/pkgconfig/ 2>/dev/null || true
cp -a $OUT/lib/pkgconfig/ext2fs.pc /tmp/e2p-out/lib/pkgconfig/ 2>/dev/null || true
rm -rf $OUT/*
cp -a /tmp/e2p-out/* $OUT/
`,
  deps: [
    dep("source", e2fsprogsSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: e2fsprogsRuntimeDeps,
});

await importToStore(recipe);
export const e2fsprogsRecipe = recipe;
