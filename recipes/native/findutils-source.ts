//! findutils source download.
import { fetchTarball } from "../../js/src/index.js";
const recipe = await fetchTarball({
  url: "https://mirrors.kernel.org/gnu/findutils/findutils-4.9.0.tar.xz",
  hash: "c1bd89ebea8e131e0b5271162b026667bce693ea834ff4b74b42890694ee0905",
});

export const findutilsSourceRecipe = recipe;
