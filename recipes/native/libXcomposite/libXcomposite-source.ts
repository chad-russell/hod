//! libXcomposite source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.x.org/releases/individual/lib/libXcomposite-0.4.6.tar.xz",
  hash: "7e02026864066869aefc1d688415b1e8c6ab0b639556f93b6f5e86063aa1bbac",
});

await importToStore(recipe);
export const libXcompositeSourceRecipe = recipe;
