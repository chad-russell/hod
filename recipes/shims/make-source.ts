//! make source — from local tarball blob.
import { fileFromPath, importToStore } from "../../js/src/index.js";
const recipe = await fileFromPath(
  "recipes/sources/make-4.4.1.tar.gz",
);

await importToStore(recipe);
export const makeSourceRecipe = recipe;
