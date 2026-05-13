//! xtrans source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.x.org/releases/individual/lib/xtrans-1.6.0.tar.xz",
  hash: "18e5a2478425ec43370d7719bc4ee4f25d01ad7f580fcc3b5d91effa267cbaaa",
});

await importToStore(recipe);
export const xtransSourceRecipe = recipe;
