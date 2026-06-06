import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://codeberg.org/dnkl/fcft/archive/3.3.2.tar.gz",
  hash: "71083cf5328ed5c80a8d03d74e0c56cdebdcd8d6419666ed2777cf4d8b457660",
});

export const fcftSourceRecipe = recipe;
