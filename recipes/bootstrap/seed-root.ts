//! seed-root bootstrap recipe — assembles the seed toolchain from busybox + musl.
import { process, dep, importToStore } from "../../js/src/index.js";
import { busyboxRecipe } from "./busybox.js";
import { muslToolchainRecipe } from "./musl-toolchain.js";
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
if [ -d /deps/musl/x86_64-linux-musl-native/share ]; then
  $BB cp -a /deps/musl/x86_64-linux-musl-native/share $OUT/
fi
if [ -d /deps/musl/x86_64-linux-musl-native/usr ]; then
  $BB cp -a /deps/musl/x86_64-linux-musl-native/usr $OUT/
fi

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
    dep("busybox", busyboxRecipe),
    dep("musl", muslToolchainRecipe),
  ],
});

await importToStore(recipe);
export const seedRootRecipe = recipe;
