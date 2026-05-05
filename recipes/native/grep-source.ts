//! grep source download.
import { download, importToStore } from "../../js/src/index.js";
const recipe = await download({
  url: "https://ftp.gnu.org/gnu/grep/grep-3.11.tar.gz",
  hash: "3f89442f3f593ad02e5a392d56d531196d43154dba716a001010b458c6f428e6",
});

await importToStore(recipe);
export const grepSourceRecipe = recipe;
