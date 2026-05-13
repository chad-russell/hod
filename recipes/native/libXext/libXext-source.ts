//! libXext source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.x.org/releases/individual/lib/libXext-1.3.6.tar.xz",
  hash: "4c24887ba3913728f3c0be945006f6babbc2c44c8118d4b1ca5366294e3f4406",
});

await importToStore(recipe);
export const libXextSourceRecipe = recipe;
