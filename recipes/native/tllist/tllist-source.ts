import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://codeberg.org/dnkl/tllist/archive/1.1.0.tar.gz",
  hash: "8822c938a0aa3136f49a563099051b6c328b202257b803ae4a5c3db962bc9a34",
});

export const tllistSourceRecipe = recipe;
