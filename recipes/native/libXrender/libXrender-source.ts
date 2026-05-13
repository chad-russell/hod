//! libXrender source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.x.org/releases/individual/lib/libXrender-0.9.12.tar.xz",
  hash: "900b431ad77835029a88fd0d874bbd0d748ff150b9e0c3841b3ce7a346cf396a",
});

await importToStore(recipe);
export const libXrenderSourceRecipe = recipe;
