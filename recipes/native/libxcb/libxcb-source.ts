//! libxcb source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.x.org/releases/individual/lib/libxcb-1.17.0.tar.xz",
  hash: "3dce3b8adc257177dfec9b6b6cf55eeac13921520dd6c372fd8f9d867600337b",
});

await importToStore(recipe);
export const libXcbSourceRecipe = recipe;
