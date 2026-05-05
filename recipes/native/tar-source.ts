//! tar source download.
import { download, importToStore } from "../../js/src/index.js";
const recipe = await download({
  url: "https://ftp.gnu.org/gnu/tar/tar-1.35.tar.gz",
  hash: "4df558b0bda4627ee8125dd434c04e1b20046a4273742476c9f92102b1b1dae7",
});

await importToStore(recipe);
export const tarSourceRecipe = recipe;
