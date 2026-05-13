//! libXdamage source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.x.org/releases/individual/lib/libXdamage-1.1.6.tar.xz",
  hash: "d3d75f2656027288f87b9ddda8bf019862c63c6e4aeadd92f45870df6c2a7ce9",
});

await importToStore(recipe);
export const libXdamageSourceRecipe = recipe;
