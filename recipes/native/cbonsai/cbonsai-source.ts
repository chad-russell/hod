//! cbonsai source download.
import { fetchTarball } from "../../../js/src/index.js";
const recipe = await fetchTarball({
  url: "https://gitlab.com/jallbrit/cbonsai/-/archive/v1.4.2/cbonsai-v1.4.2.tar.gz",
  hash: "727a0553ab357619b9fa0f3dc71614f11ad8ff51120b83dc9567abbc0d520997",
});

export const cbonsaiSourceRecipe = recipe;
