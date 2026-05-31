//! coreutils native build recipe.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { hodSeedRootRecipe } from "../bootstrap/hod-seed-root.js";
import { shimsBundleRecipe } from "../shims/shims-bundle.js";
import { gccStage1Recipe } from "../cross/gcc-stage1.js";
import { glibcRecipe } from "../cross/glibc.js";
import { linuxHeadersRecipe } from "../cross/linux-headers.js";
import { coreutilsSourceRecipe } from "./coreutils-source.js";

const preamble = hermeticPreamble({
  shims: "shims",
  shell: "seed",
  muslLinker: "seed",
  glibcLinker: "glibc",
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
cd /tmp/build

# Configure coreutils as cross-compile (musl build -> glibc target)
# FORCE_UNSAFE_CONFIGURE=1 needed when building as root (uid 0 in user namespace)
# Various cache variables for cross-compile mode
CC="/deps/gcc-stage1/bin/x86_64-linux-gnu-gcc --sysroot=/tmp/sysroot -B/deps/seed/bin/" \\
CFLAGS="-O2" \\
LDFLAGS="-L/deps/gcc-stage1/lib -L/deps/gcc-stage1/lib/gcc/x86_64-linux-gnu/13.2.0 -Wl,-rpath,/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/dummy" \\
FORCE_UNSAFE_CONFIGURE=1 \\
./configure \\
  --prefix=/ \\
  --build=x86_64-linux-musl \\
  --host=x86_64-linux-gnu \\
  --disable-nls \\
  gl_cv_func_fstatat_empty_filename_works=yes \\
  gl_cv_func_fchmodat_empty_filename_works=yes \\
  gl_cv_func_fchownat_empty_filename_works=yes \\
  gl_cv_func_faccessat_works=yes \\
  gl_cv_func_euidaccess_works=yes \\
  gl_cv_func_getcwd_null=yes \\
  gl_cv_func_getdelim_yes=yes \\
  gl_cv_func_mknod_works=yes \\
  gl_cv_func_stat_empty_string_works=yes \\
  gl_cv_func_lstat_empty_string_works=yes \\
  ac_cv_func_linkat=yes \\
  ac_cv_func_syncfs=yes \\
  ac_cv_func_fanotify_init=yes \\
  ac_cv_func_fallocate=yes \\
  gl_cv_func_working_futimes=yes

make -j$(nproc)
make install DESTDIR=$OUT MAKEINFO=true

# Strip binaries
cd $OUT/bin
for bin in *; do
  if [ -f "$bin" ] && [ -x "$bin" ]; then
    /deps/seed/bin/strip "$bin" 2>/dev/null || true
  fi
done

# Clean up - keep only bin/
rm -rf $OUT/share $OUT/include $OUT/lib $OUT/etc $OUT/sbin 2>/dev/null || true`,
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
    dep("source", coreutilsSourceRecipe),
  ],
});

await importToStore(recipe);
export const coreutilsRecipe = recipe;
