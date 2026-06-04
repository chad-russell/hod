//! libfyaml build recipe — fully feature-complete YAML parser and emitter.
//!
//! Builds libfyaml 0.9.6. No external dependencies beyond the toolchain.
//! Required by appstream.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libfyamlSourceRecipe } from "./libfyaml-source.js";
import { m4Recipe } from "../m4/m4.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const libfyamlRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  ...cProfile({
    cxx: true,
    binDeps: ["m4"],
  }),
  sourceDir: true,
  script: `
export CPP="/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin -E"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", libfyamlSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("m4", m4Recipe),
  ],
  runtime_deps: libfyamlRuntimeDeps,
});

await importToStore(recipe);
export const libfyamlRecipe = recipe;
