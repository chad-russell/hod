//! findutils source download.
import { download, importToStore } from "../../js/src/index.js";
const recipe = await download({
  url: "https://ftp.gnu.org/gnu/findutils/findutils-4.9.0.tar.xz",
  hash: "c1bd89ebea8e131e0b5271162b026667bce693ea834ff4b74b42890694ee0905",
});

await importToStore(recipe);
export const findutilsSourceRecipe = recipe;
