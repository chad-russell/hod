//! bash native build recipe.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { hodSeedRootRecipe } from "../bootstrap/hod-seed-root.js";
import { shimsBundleRecipe } from "../shims/shims-bundle.js";
import { gccStage1Recipe } from "../cross/gcc-stage1.js";
import { glibcRecipe } from "../cross/glibc.js";
import { linuxHeadersRecipe } from "../cross/linux-headers.js";
import { bashSourceRecipe } from "./bash-source.js";

const preamble = hermeticPreamble({
  shell: "seed",
  muslLinker: "seed",
  glibcLinker: "glibc",
  shims: "shims",
  sysroot: { glibc: "glibc", linuxHeaders: "linux-headers" },
});

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

cp -a /deps/source/. /tmp/build
cd /tmp/build

# Configure bash as a cross-compile (musl build machine -> glibc target)
# CC includes --sysroot so all compiler invocations find glibc headers/libs
# Pre-set cache variables for things configure can't test-run in cross mode
CC="/deps/gcc-stage1/bin/x86_64-linux-gnu-gcc --sysroot=/tmp/sysroot -B/deps/seed/bin/" \\
CFLAGS="-O2" \\
LDFLAGS="-L/deps/gcc-stage1/lib -L/deps/gcc-stage1/lib/gcc/x86_64-linux-gnu/13.2.0 -Wl,-rpath,/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/dummy" \\
./configure \\
  --prefix=/ \\
  --build=x86_64-linux-musl \\
  --host=x86_64-linux-gnu \\
  --without-bash-malloc \\
  --disable-nls \\
  bash_cv_dev_fd=standard \\
  bash_cv_getcwd_malloc=yes \\
  bash_cv_job_control_missing=present \\
  bash_cv_printf_a_format=yes \\
  bash_cv_sys_named_pipes=present \\
  bash_cv_ulimit_max_handles=yes \\
  bash_cv_under_sys_siglist=yes \\
  bash_cv_unusable_rtime=no \\
  ac_cv_func_working_mktime=yes \\
  gt_cv_func_printf_posix=yes

make -j$(nproc)
make install DESTDIR=$OUT

# Strip the binary
/deps/seed/bin/strip $OUT/bin/bash 2>/dev/null || true

# Clean up - keep only what's needed
rm -rf $OUT/share $OUT/include $OUT/lib $OUT/etc 2>/dev/null || true`,
  ],
  env: [
    { key: "C_INCLUDE_PATH", value: "/deps/gcc-stage1/include:/deps/glibc/include:/deps/linux-headers/include" },
    { key: "LIBRARY_PATH", value: "/deps/glibc/lib:/deps/gcc-stage1/lib:/deps/gcc-stage1/lib/gcc/x86_64-linux-gnu/13.2.0" },
  ],
  runtime_deps: ["glibc"],
  dependencies: [
    dep("gcc-stage1", gccStage1Recipe),
    dep("glibc", glibcRecipe),
    dep("linux-headers", linuxHeadersRecipe),
    dep("seed", hodSeedRootRecipe),
    dep("shims", shimsBundleRecipe),
    dep("source", bashSourceRecipe),
  ],
});

await importToStore(recipe);
export const bashRecipe = recipe;
