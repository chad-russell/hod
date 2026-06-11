//! gawk source download.
import { download, importToStore } from "../../js/src/index.js";

const recipe = await download({
  url: "https://ftp.gnu.org/gnu/gawk/gawk-5.3.2.tar.gz",
  hash: "10f160df667b8d7f2877f5abcda2ab1f5a756988bc77233a0d1a7592a516aab2",
});

await importToStore(recipe);
export const gawkSourceRecipe = recipe;
