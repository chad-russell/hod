//! Hod-built seed root — assembles the seed toolchain from busybox + Hod-built musl.
//!
//! This is identical to seed-root.ts but uses the Hod-built musl toolchain
//! (gcc + binutils + musl from source) instead of the pre-built musl.cc download.
//!
//! This recipe is used by downstream consumers that want a fully auditable
//! bootstrap. The original seed-root.ts is still used for early-stage
//! bootstrapping (shims, etc.) because those recipes have a circular dependency
//! if they go through the Hod-built toolchain.
//!
//! The output layout is identical to seed-root.ts, so anything that depends
//! on seed-root can use this instead.
import { process, dep, importToStore } from "../../js/src/index.js";
import { busyboxFromSourceRecipe } from "./busybox-from-source.js";
import { hodMuslToolchainRecipe } from "./hod-musl-toolchain.js";
const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/busybox/busybox",
  args: [
    "sh",
    "-c",
    `BB=/deps/busybox/busybox
set -e

$BB mkdir -p $OUT/bin $OUT/lib $OUT/include $OUT/tmp

$BB cp -a /deps/musl/x86_64-linux-musl-native/bin/* $OUT/bin/
$BB cp -a /deps/musl/x86_64-linux-musl-native/lib/* $OUT/lib/ 2>/dev/null || true
$BB cp -a /deps/musl/x86_64-linux-musl-native/include/* $OUT/include/ 2>/dev/null || true
if [ -d /deps/musl/x86_64-linux-musl-native/x86_64-linux-musl ]; then
  $BB cp -a /deps/musl/x86_64-linux-musl-native/x86_64-linux-musl $OUT/
fi
if [ -d /deps/musl/x86_64-linux-musl-native/libexec ]; then
  $BB cp -a /deps/musl/x86_64-linux-musl-native/libexec $OUT/
fi
# Recreate usr/ as lightweight symlinks rather than copying the tarball's usr/
# tree. The musl.cc native gcc searches <prefix>/usr/include and <prefix>/usr/lib
# by default (confirmed via \`gcc -print-search-dirs\`), so the seed compiler needs
# these paths to find stdio.h, crt*.o, and libc. We avoid \`cp -a usr/\` because the
# tarball's usr/ is a self-recursive tree that inflates to ~22G. share/ stays
# omitted (only gdb pretty-printers + man pages, unreferenced by /deps/seed/).
$BB mkdir -p $OUT/usr
$BB ln -s ../include $OUT/usr/include
$BB ln -s ../lib $OUT/usr/lib
$BB ln -s ../bin $OUT/usr/bin

$BB cp /deps/busybox/busybox $OUT/bin/busybox
$BB chmod +x $OUT/bin/busybox

for applet in $($BB --list); do
  case $applet in
    ar|as|ld|nm|objcopy|objdump|ranlib|readelf|strip|gcc|g++|cpp|c++|dwp|elfedit|gcov|gcov-dump|gcov-tool|gfortran|gprof|lto-dump|size|strings|addr2line|c++filt|gcc-ar|gcc-nm|gcc-ranlib) continue ;;
  esac
  if [ -e $OUT/bin/$applet ]; then continue; fi
  $BB ln -sf busybox $OUT/bin/$applet 2>/dev/null || true
done

echo done > $OUT/seed-ready`,
  ],
  dependencies: [
    dep("busybox", busyboxFromSourceRecipe),
    dep("musl", hodMuslToolchainRecipe),
  ],
});

await importToStore(recipe);
export const hodSeedRootRecipe = recipe;
