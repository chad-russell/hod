//! bash source download.
import { download, importToStore } from "../../js/src/index.js";
const recipe = await download({
  url: "https://ftp.gnu.org/gnu/bash/bash-5.2.37.tar.gz",
  hash: "78d49588b74add7bb37317fb7aee7a5979e2cab4b34b1fd40306fb464bb46bdc",
});

await importToStore(recipe);
export const bashSourceRecipe = recipe;
