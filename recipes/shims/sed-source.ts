//! sed source — from local tarball blob.
import { fileFromPath, importToStore } from "../../js/src/index.js";
const recipe = await fileFromPath(
  "recipes/sources/sed-4.9.tar.gz",
);

await importToStore(recipe);
export const sedSourceRecipe = recipe;
