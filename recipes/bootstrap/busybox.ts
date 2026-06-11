//! busybox bootstrap file recipe.
import { fileFromHash, importToStore } from "../../js/src/index.js";

const recipe = await fileFromHash(
  "41eee14fead1f5f637e613b5bb865caab4fd3624f6bf5ebbe5280de5a8a6abac",
  { executable: true },
);

await importToStore(recipe);
export const busyboxRecipe = recipe;
