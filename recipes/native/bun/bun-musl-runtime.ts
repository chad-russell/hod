//! Runtime libraries for the upstream Bun musl binary.
//!
//! The Hod musl toolchain stores libraries under
//! `x86_64-linux-musl-native/lib`, while Hod's ELF relocation pass expects
//! runtime libraries and the dynamic loader under a top-level `lib/`.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { hodMuslToolchainRecipe } from "../../bootstrap/hod-musl-toolchain.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `
mkdir -p $OUT/lib
cp -a /deps/musl/x86_64-linux-musl-native/lib/libc.so $OUT/lib/
ln -sf libc.so $OUT/lib/ld-musl-x86_64.so.1
ln -sf libc.so $OUT/lib/libc.musl-x86_64.so.1
cp -a /deps/musl/x86_64-linux-musl-native/lib/libstdc++.so* $OUT/lib/
cp -a /deps/musl/x86_64-linux-musl-native/lib/libgcc_s.so* $OUT/lib/
`,
  deps: [
    dep("musl", hodMuslToolchainRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
});

await importToStore(recipe);
export const bunMuslRuntimeRecipe = recipe;
