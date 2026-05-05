//! Glibc cross-compilation recipe — TypeScript proof of concept.
//!
//! This converts recipes/cross/glibc.json to TypeScript using the hod SDK.
//! The dependencies are referenced by their known hashes (matching the .json files).
//!
//! Run with: bun run recipes/cross/glibc.ts

import {
  process,
  dep,
  writeHod,
  writeJson,
  fromJson,
  type BuiltRecipe,
} from "../../js/src/index.js";

const dir = import.meta.dir;

// Import dependency recipes from their JSON files.
// These must exist on disk and be encodable (i.e., use supported recipe types).
// For deps that reference unsupported types (like "unpack"), we use hardcoded hashes
// from the known .json files.
const linuxHeaders: BuiltRecipe = await fromJson(`${dir}/linux-headers.json`);
const source: BuiltRecipe = await fromJson(`${dir}/glibc-source.json`);

// Seed and shims use recipe types not yet in the binary encoder, so use their
// known hashes directly. These match the .json / .hod files on disk.
const seedHash = "8f3d75b0806864abbc7ae6d0bae8d4a1ab54b37ec19f537da8717e0fd251b12a";
const pythonHash = "1a7c67bcc283ba368ece05b163e706b381b849b19c8df34958b4dab920fb5e89";
const shimsHash = "0f9d6866f39d2c61099ebf720bc8e708e5064804319d0a1f0bbe06a4584c2300";

const glibc = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

tar xf /deps/source/source -C /tmp
cd /tmp/glibc-2.41

# Glibc requires a separate build directory
mkdir build
cd build

# Install configparms for sbin
echo "rootsbindir=/sbin" > configparms

../configure \\
  --host=x86_64-linux-gnu \\
  --prefix=/ \\
  --disable-werror \\
  --enable-kernel=4.14 \\
  --with-headers=/deps/linux-headers/include \\
  CC=/deps/seed/bin/gcc \\
  AR=/deps/seed/bin/ar \\
  RANLIB=/deps/seed/bin/ranlib \\
  AS=/deps/seed/bin/as \\
  LD=/deps/seed/bin/ld.bfd \\
  NM=/deps/seed/bin/nm \\
  OBJDUMP=/deps/seed/bin/objdump \\
  OBJCOPY=/deps/seed/bin/objcopy \\
  STRIP=/deps/seed/bin/strip \\
  AWK=/deps/shims/bin/gawk \\
  BISON=/deps/shims/bin/bison \\
  M4=/deps/shims/bin/m4 \\
  PYTHON=/deps/python/bin/python3 \\
  libc_cv_slibdir=/lib

make -j$(nproc)

# Skip test-installation sanity check
sed '/test-installation/s@$(PERL)@echo not running@' -i ../Makefile

make install DESTDIR=$OUT

# Create essential directory structure
mkdir -p $OUT/etc
mkdir -p $OUT/var/cache/nscd
touch $OUT/etc/ld.so.conf

# Create lib64 symlink for x86_64 compatibility
mkdir -p $OUT/lib64
ln -sf ../lib/ld-linux-x86-64.so.2 $OUT/lib64/ld-linux-x86-64.so.2

# Create /usr symlinks for FHS compatibility
mkdir -p $OUT/usr
ln -sf ../lib $OUT/usr/lib
ln -sf ../include $OUT/usr/include
ln -sf ../lib64 $OUT/usr/lib64`,
  ],
  env: [
    { key: "BISON_PKGDATADIR", value: "/deps/shims/share/bison" },
    { key: "CFLAGS", value: "-g -O2 -Wno-error -U_FORTIFY_SOURCE" },
    { key: "M4", value: "/deps/shims/bin/m4" },
  ],
  dependencies: [
    dep("linux-headers", linuxHeaders),
    dep("python", pythonHash),
    dep("seed", seedHash),
    dep("shims", shimsHash),
    dep("source", source),
  ],
});

// Write outputs
await writeHod(glibc, `${dir}/glibc-from-ts.hod`);
writeJson(glibc, `${dir}/glibc-from-ts.json`);

// Verify: compare hash against known value from the hand-written JSON
const expectedHash = "e85c8f099589c0000bc9c3ab9c9445a251a0bfb5a3cb1216880bcee7057d7aa7";
if (glibc.hash === expectedHash) {
  console.log(`✅ glibc hash matches: ${glibc.hash}`);
} else {
  console.error(`❌ glibc hash mismatch!`);
  console.error(`   expected: ${expectedHash}`);
  console.error(`   got:      ${glibc.hash}`);
  process.exit(1);
}

export const glibcRecipe = glibc;
