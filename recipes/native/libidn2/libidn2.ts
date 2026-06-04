//! libidn2 build recipe — Internationalized domain names library.
//!
//! Builds libidn2 2.3.7 with libunistring support.
//! Dependencies: libunistring, libiconv, toolchain.
//! Required by libpsl.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libidn2SourceRecipe } from "./libidn2-source.js";
import { libunistringRecipe } from "../libunistring/libunistring.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const libidn2RuntimeDeps = ["libiconv", "libunistring", "toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["libunistring", "libiconv"],
    libDeps: ["libunistring", "libiconv"],
    pkgConfigDeps: ["libunistring", "libiconv"],
  }),
  sourceDir: true,
  script: `
export LD_LIBRARY_PATH="/deps/libunistring/lib:/deps/libiconv/lib"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --with-libunistring-prefix=/deps/libunistring \\
  --disable-doc \\
  --disable-gtk-doc

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", libidn2SourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("libunistring", libunistringRecipe),
    dep("libiconv", libiconvRecipe),
  ],
  runtime_deps: libidn2RuntimeDeps,
});

await importToStore(recipe);
export const libidn2Recipe = recipe;
