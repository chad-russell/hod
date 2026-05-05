//! patch source download.
import { download, importToStore } from "../../js/src/index.js";
const recipe = await download({
  url: "https://ftp.gnu.org/gnu/patch/patch-2.7.6.tar.gz",
  hash: "2dde87045910b23843159784859ef52a6093f9f213253ede665518667e5b0c35",
});

await importToStore(recipe);
export const patchSourceRecipe = recipe;
