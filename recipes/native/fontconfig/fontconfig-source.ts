//! fontconfig source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.freedesktop.org/software/fontconfig/release/fontconfig-2.16.0.tar.xz",
  hash: "5c95d48f5b9150f4a06d8acac12c25edaac956007df95a3bf527df02a5908f0e",
});

await importToStore(recipe);
export const fontconfigSourceRecipe = recipe;
