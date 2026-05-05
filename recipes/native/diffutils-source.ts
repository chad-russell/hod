//! diffutils source download.
import { download, importToStore } from "../../js/src/index.js";
const recipe = await download({
  url: "https://ftp.gnu.org/gnu/diffutils/diffutils-3.11.tar.gz",
  hash: "10626ae01dc2fc76e606eb7d047dbda323fda8664295a65f697dfe7e3c5cb183",
});

await importToStore(recipe);
export const diffutilsSourceRecipe = recipe;
