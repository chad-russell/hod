//! busybox bootstrap file recipe.
import { fileFromPath, importToStore } from "../../js/src/index.js";
const recipe = await fileFromPath(
  "recipes/sources/busybox",
  { executable: true },
);

await importToStore(recipe);
export const busyboxRecipe = recipe;
