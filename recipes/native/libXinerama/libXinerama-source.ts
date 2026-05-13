//! libXinerama source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.x.org/releases/individual/lib/libXinerama-1.1.5.tar.xz",
  hash: "58b4020c8a8fb62707f5073f967bf8abbc8dc7cff35c5750fabe097f46a924b4",
});

await importToStore(recipe);
export const libXineramaSourceRecipe = recipe;
