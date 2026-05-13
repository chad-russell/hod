//! libpng source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.sourceforge.net/libpng/libpng-1.6.47.tar.xz",
  hash: "17ee6fad6699ca68c8c5094f58f040a2a86d2bb74fc37dfeb424040400781c96",
});

await importToStore(recipe);
export const libpngSourceRecipe = recipe;
