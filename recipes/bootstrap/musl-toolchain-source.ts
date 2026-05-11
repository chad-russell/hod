//! musl-toolchain source — from local tarball blob.
import { fileFromPath, importToStore } from "../../js/src/index.js";
const recipe = await fileFromPath(
  "recipes/sources/x86_64-linux-musl-native.tgz",
);

await importToStore(recipe);
export const muslToolchainSourceRecipe = recipe;
