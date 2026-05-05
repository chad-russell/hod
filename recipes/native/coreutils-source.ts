//! coreutils source download.
import { download, importToStore } from "../../js/src/index.js";
const recipe = await download({
  url: "https://ftp.gnu.org/gnu/coreutils/coreutils-9.5.tar.gz",
  hash: "04b361e2793fd1c1eddf38535a700a89e9f84183b1b97fe6c927cd9f81aec028",
});

await importToStore(recipe);
export const coreutilsSourceRecipe = recipe;
