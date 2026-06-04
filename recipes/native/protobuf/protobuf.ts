//! protoc binary — pre-built protobuf compiler from upstream releases.
//!
//! Extracts the official protoc binary from the Google protobuf release zip.
//! Per AGENTS.md, upstream release binaries are preferred when the artifact
//! is content-hashed and self-contained.
//!
//! Provides: bin/protoc, include/google/protobuf/*.proto

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { protocSourceRecipe } from "./protobuf-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `
mkdir -p $OUT/bin $OUT/include
cp bin/protoc $OUT/bin/protoc
chmod 755 $OUT/bin/protoc
cp -a include/. $OUT/include/
`,
  deps: [
    dep("source", protocSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const protocRecipe = recipe;
