//! gawk source — from local tarball blob.
import { fileFromPath, importToStore } from "../../js/src/index.js";
const recipe = await fileFromPath(
  "recipes/sources/gawk-5.3.2.tar.gz",
);

await importToStore(recipe);
export const gawkSourceRecipe = recipe;
