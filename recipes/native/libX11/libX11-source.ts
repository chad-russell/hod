//! libX11 source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.x.org/releases/individual/lib/libX11-1.8.11.tar.xz",
  hash: "4627c625278df142ad28319227f0088040756719abe00d9d4c35c0d9c84e1216",
});

await importToStore(recipe);
export const libX11SourceRecipe = recipe;
