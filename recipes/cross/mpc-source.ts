//! mpc source download.
import { download, importToStore } from "../../js/src/index.js";
const recipe = await download({
  url: "https://ftp.gnu.org/gnu/mpc/mpc-1.3.1.tar.gz",
  hash: "86d083c43c08e98d4470c006a01e0df727c8ff56ddd2956b170566ba8c9a46de",
});

await importToStore(recipe);
export const mpcSourceRecipe = recipe;
