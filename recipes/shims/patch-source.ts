//! patch source — from local tarball blob.
import { fileFromPath, importToStore } from "../../js/src/index.js";
const recipe = await fileFromPath(
  "recipes/sources/patch-2.7.6.tar.gz",
);

await importToStore(recipe);
export const patchSourceRecipe = recipe;
