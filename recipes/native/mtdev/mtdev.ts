//! mtdev build recipe — Multitouch Protocol Translation Library.
//!
//! Builds mtdev 1.1.7, which transforms all variants of kernel MT events
//! to the slotted type B protocol. Required by libinput.
//!
//! Dependencies at runtime: toolchain (glibc).
//! Build-time only: autoconf, automake, make, libtool, m4.

import { shellBuild, dep, importToStore, hermeticPreamble } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { mtdevSourceRecipe } from "./mtdev-source.js";
import { autoconfRecipe } from "../autoconf/autoconf.js";
import { automakeRecipe } from "../automake/automake.js";
import { makeRecipe } from "../make.ts";
import { libtoolRecipe } from "../libtool/libtool.js";
import { m4Recipe } from "../m4/m4.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const mtdevRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  shell: "/deps/toolchain/bin/busybox",
  preamble: hermeticPreamble({ shell: "toolchain", glibcLinker: "toolchain" }),
  env: {
    PATH: "/deps/toolchain/bin:/deps/autoconf/bin:/deps/automake/bin:/deps/make/bin:/deps/libtool/bin:/deps/m4/bin",
    CC: "/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin",
  },
  sourceDir: true,
  script: `
./configure \\
  --prefix=/ \\
  --libdir=/lib \\
  --disable-static

make -j$(nproc)
make DESTDIR=$OUT install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", mtdevSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("autoconf", autoconfRecipe),
    dep("automake", automakeRecipe),
    dep("make", makeRecipe),
    dep("libtool", libtoolRecipe),
    dep("m4", m4Recipe),
  ],
  runtime_deps: mtdevRuntimeDeps,
});

await importToStore(recipe);
export const mtdevRecipe = recipe;
