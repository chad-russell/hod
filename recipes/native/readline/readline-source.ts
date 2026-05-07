//! readline source download.
import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://ftp.gnu.org/gnu/readline/readline-8.3.tar.gz",
  hash: "7109f094062bda387a0c16b4875375b96e36437bebbbd8d8f91bb27ba01d687f",
});

await importToStore(recipe);
export const readlineSourceRecipe = recipe;
