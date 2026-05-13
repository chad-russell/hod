//! libXrandr source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.x.org/releases/individual/lib/libXrandr-1.5.4.tar.xz",
  hash: "c107a47d9c4329996d74d7a1ab8d254a2cf3aecea1575d7e146da9a06b762081",
});

await importToStore(recipe);
export const libXrandrSourceRecipe = recipe;
