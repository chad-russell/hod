//! libXi source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.x.org/releases/individual/lib/libXi-1.8.2.tar.xz",
  hash: "8f0acdd884dc928c6c8bc4b6bca1f4c67c726fdb03e30910c09bdb41fd841d3e",
});

await importToStore(recipe);
export const libXiSourceRecipe = recipe;
