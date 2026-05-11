//! glibc cross-compilation recipe.
//!
//! IMPORTANT: CXX=no-such-compiler is set to prevent glibc's configure from
//! detecting g++ in the seed toolchain. If g++ is found, glibc builds
//! links-dso-program with -lstdc++ -pie, which causes a linker error because
//! the musl-built libstdc++.so references `atexit`, but in glibc's build tree
//! `atexit` is a hidden symbol in libc_nonshared.a that can't be referenced
//! from a PIE/DSO. The C-only links-dso-program-c avoids this entirely.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { hodSeedRootRecipe } from "../bootstrap/hod-seed-root.js";
import { pythonInstallRecipe } from "../bootstrap/python-install.js";
import { shimsBundleRecipe } from "../shims/shims-bundle.js";
import { linuxHeadersRecipe } from "./linux-headers.js";
import { glibcSourceRecipe } from "./glibc-source.js";

const preamble = hermeticPreamble({ shell: "seed", muslLinker: "seed", shims: "shims" });

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

export PATH="/deps/python/bin:$PATH"
export MAKE="/deps/shims/bin/make"
export PYTHON="/deps/python/bin/python3"

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
  CC=/deps/seed/bin/gcc \
  CXX=no-such-compiler \\
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
    { key: "PYTHONHOME", value: "/deps/python" },
  ],
  dependencies: [
    dep("linux-headers", linuxHeadersRecipe),
    dep("python", pythonInstallRecipe),
    dep("seed", hodSeedRootRecipe),
    dep("shims", shimsBundleRecipe),
    dep("source", glibcSourceRecipe),
  ],
});

await importToStore(recipe);
export const glibcRecipe = recipe;
