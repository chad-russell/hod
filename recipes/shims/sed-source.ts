//! sed source download.
import { download, importToStore } from "../../js/src/index.js";

const recipe = await download({
  url: "https://ftp.gnu.org/gnu/sed/sed-4.9.tar.gz",
  hash: "ad2e8a57e5e6216c2baf8519468e3f3834da6d92185fb2c21a1bf92d7d6171ef",
});

await importToStore(recipe);
export const sedSourceRecipe = recipe;
