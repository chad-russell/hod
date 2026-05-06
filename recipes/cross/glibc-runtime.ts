//! glibc-runtime cross-compilation recipe — extracts runtime shared libraries from glibc.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { hodSeedRootRecipe } from "../bootstrap/hod-seed-root.js";
import { glibcRecipe } from "./glibc.js";

const preamble = hermeticPreamble({ shell: "seed" });

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

mkdir -p $OUT
cp -a /deps/glibc/lib/ld-linux-x86-64.so.2 $OUT/
cp -a /deps/glibc/lib/libc.so.6 $OUT/
cp -a /deps/glibc/lib/libc.so $OUT/ 2>/dev/null || true
cp -a /deps/glibc/lib/libc-[0-9]*.so $OUT/ 2>/dev/null || true
cp -a /deps/glibc/lib/libm.so.6 $OUT/ 2>/dev/null || true
cp -a /deps/glibc/lib/libm-[0-9]*.so $OUT/ 2>/dev/null || true
cp -a /deps/glibc/lib/libpthread.so.0 $OUT/ 2>/dev/null || true
cp -a /deps/glibc/lib/libdl.so.2 $OUT/ 2>/dev/null || true
cp -a /deps/glibc/lib/librt.so.1 $OUT/ 2>/dev/null || true`,
  ],
  dependencies: [
    dep("glibc", glibcRecipe),
    dep("seed", hodSeedRootRecipe),
  ],
});

await importToStore(recipe);
export const glibcRuntimeRecipe = recipe;
