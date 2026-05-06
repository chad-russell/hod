//! Debug recipe — test coreutils ls with various ld-linux flags.
import { process, dep, importToStore, hermeticPreamble } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { hodSeedRootRecipe } from "../../bootstrap/hod-seed-root.js";
import { binutilsRecipe } from "../binutils.js";

const preamble = hermeticPreamble({
  shell: "seed",
  muslLinker: "seed",
  glibcLinker: "toolchain",
});

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `${preamble}

echo "=== Test: direct ld-linux execution ==="
/lib64/ld-linux-x86-64.so.2 /deps/toolchain/bin/ls /tmp/ 2>&1
echo "exit: $?"

echo "=== Test: ld-linux --inhibit-rpath ==="
/lib64/ld-linux-x86-64.so.2 --inhibit-rpath "" --library-path /lib /deps/toolchain/bin/ls /tmp/ 2>&1
echo "exit: $?"

echo "=== Test: ld-linux --verify ==="
/lib64/ld-linux-x86-64.so.2 --verify /deps/toolchain/bin/ls 2>&1
echo "exit: $?"

echo "=== Test: ls without any args ==="
LD_LIBRARY_PATH=/lib /deps/toolchain/bin/ls 2>&1
echo "exit: $?"

echo "=== Test: ls --version ==="
LD_LIBRARY_PATH=/lib /deps/toolchain/bin/ls --version 2>&1
echo "exit: $?"

echo "=== Test: check ls PT_INTERP ==="
/deps/binutils/bin/readelf -l /deps/toolchain/bin/ls 2>&1 | grep -A2 INTERP

echo "=== Test: check gcc PT_INTERP ==="
/deps/binutils/bin/readelf -l /deps/toolchain/bin/gcc 2>&1 | grep -A2 INTERP

echo "=== Test: check bash PT_INTERP ==="
/deps/binutils/bin/readelf -l /deps/toolchain/bin/bash 2>&1 | grep -A2 INTERP

echo "=== Test: check /lib64/ld-linux resolves ==="
ls -la /lib64/ld-linux-x86-64.so.2
readlink -f /lib64/ld-linux-x86-64.so.2 2>/dev/null || ls -la /deps/toolchain/lib/ld-linux-x86-64.so.2
ls -la /deps/toolchain/sysroot/lib/ld-linux-x86-64.so.2 2>/dev/null || echo "sysroot ld not found"
ls -la /deps/toolchain/sysroot/lib/ld-* 2>/dev/null

echo "=== Test: check /lib/libc.so.6 resolves ==="
ls -la /lib/libc.so.6
ls -la /deps/toolchain/lib/libc.so.6
ls -la /deps/toolchain/sysroot/lib/libc.so.6
ls -la /deps/toolchain/sysroot/lib/libc-2* 2>/dev/null

echo done > $OUT/test.txt`,
  ],
  env: [
    { key: "C_INCLUDE_PATH", value: "" },
  ],
  dependencies: [
    dep("binutils", binutilsRecipe),
    dep("seed", hodSeedRootRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
});

await importToStore(recipe);
export const debugRecipe = recipe;
