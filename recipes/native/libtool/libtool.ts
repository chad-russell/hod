//! libtool build recipe — generic library support script.
//!
//! Builds GNU libtool 2.5.4, a generic library support script that abstracts
//! away the complexity of building shared libraries across platforms.
//!
//! Required by autotools-based packages that use AC_PROG_LIBTOOL.
//!
//! Dependencies at runtime: toolchain (glibc).
//! Build-time: autoconf, automake, make, m4.

import { shellBuild, dep, importToStore, hermeticPreamble } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libtoolSourceRecipe } from "./libtool-source.js";
import { autoconfRecipe } from "../autoconf/autoconf.js";
import { automakeRecipe } from "../automake/automake.js";
import { makeRecipe } from "../make.ts";
import { m4Recipe } from "../m4/m4.js";
import { STRIP_ALL } from "../../helpers/strip.js";

export const libtoolRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  shell: "/deps/toolchain/bin/busybox",
  preamble: hermeticPreamble({ shell: "toolchain", glibcLinker: "toolchain" }),
  env: {
    PATH: "/deps/toolchain/bin:/deps/autoconf/bin:/deps/automake/bin:/deps/make/bin:/deps/m4/bin",
    CC: "/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin",
    CXX: "/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin",
  },
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

./configure \\
  --prefix=/

make -j$(nproc)
make DESTDIR=$OUT install

${STRIP_ALL}
`,
  deps: [
    dep("source", libtoolSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("autoconf", autoconfRecipe),
    dep("automake", automakeRecipe),
    dep("make", makeRecipe),
    dep("m4", m4Recipe),
  ],
  runtime_deps: libtoolRuntimeDeps,
});

await importToStore(recipe);
export const libtoolRecipe = recipe;
