//! diffutils source download.
import { fetchTarball } from "../../js/src/index.js";
const recipe = await fetchTarball({
  url: "https://mirrors.kernel.org/gnu/diffutils/diffutils-3.11.tar.gz",
  hash: "10626ae01dc2fc76e606eb7d047dbda323fda8664295a65f697dfe7e3c5cb183",
});

export const diffutilsSourceRecipe = recipe;
