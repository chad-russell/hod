//! python unpack recipe.
import { unpack, importToStore } from "../../js/src/index.js";
import { pythonSourceRecipe } from "./python-source.js";
const recipe = await unpack({
  archive_hash: "a2dd7179717e105867adb832e7fe78f4ec54cfc4b35ea5c0aa000ec37f9fd135",
  format: "tar_gz",
  archive_recipe_hash: pythonSourceRecipe.hash,
});

await importToStore(recipe);
export const pythonRecipe = recipe;
