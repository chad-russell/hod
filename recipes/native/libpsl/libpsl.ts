//! libpsl build recipe — C library for the Public Suffix List.
//!
//! Builds libpsl 0.21.5 with libidn2 support.
//! Dependencies: libidn2, libunistring, libiconv, toolchain.
//! Required by libsoup3.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libpslSourceRecipe } from "./libpsl-source.js";
import { libidn2Recipe } from "../libidn2/libidn2.js";
import { libunistringRecipe } from "../libunistring/libunistring.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { pythonRecipe } from "../python/python.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const libpslRuntimeDeps = ["libiconv", "libidn2", "libunistring", "toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    binDeps: ["python"],
    includeDeps: ["libidn2", "libunistring", "libiconv"],
    libDeps: ["libidn2", "libunistring", "libiconv"],
    pkgConfigDeps: ["libidn2", "libunistring", "libiconv"],
  }),
  sourceDir: true,
  script: `
export LD_LIBRARY_PATH="/deps/libidn2/lib:/deps/libunistring/lib:/deps/libiconv/lib"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --enable-runtime=libidn2 \\
  --enable-builtin=libidn2 \\
  --disable-gtk-doc \\
  --disable-man

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", libpslSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("libidn2", libidn2Recipe),
    dep("libunistring", libunistringRecipe),
    dep("libiconv", libiconvRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: libpslRuntimeDeps,
});

await importToStore(recipe);
export const libpslRecipe = recipe;
