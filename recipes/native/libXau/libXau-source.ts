//! libXau source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.x.org/releases/individual/lib/libXau-1.0.12.tar.xz",
  hash: "674bc71a888eec20f0e29989e4669df90309d4baacad058107cdf89d23803bcc",
});

await importToStore(recipe);
export const libXauSourceRecipe = recipe;
