//! tar source download.
import { fetchTarball } from "../../js/src/index.js";
const recipe = await fetchTarball({
  url: "https://mirrors.kernel.org/gnu/tar/tar-1.35.tar.gz",
  hash: "4df558b0bda4627ee8125dd434c04e1b20046a4273742476c9f92102b1b1dae7",
});

export const tarSourceRecipe = recipe;
