//! make source download.
import { download, importToStore } from "../../js/src/index.js";
const recipe = await download({
  url: "https://ftp.gnu.org/gnu/make/make-4.4.1.tar.gz",
  hash: "a7d8aee97b7e9a525ef561afa84eea0d929f246e3aafa420231c0602151cf9eb",
});

await importToStore(recipe);
export const makeSourceRecipe = recipe;
