//! bison source download.
import { download, importToStore } from "../../js/src/index.js";
const recipe = await download({
  url: "https://ftp.gnu.org/gnu/bison/bison-3.8.2.tar.gz",
  hash: "9a529d3945d46103faa144ad1998b6c7dcf4653166fceee1ef59baef3c853c34",
});

await importToStore(recipe);
export const bisonSourceRecipe = recipe;
