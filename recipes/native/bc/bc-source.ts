//! bc source download.
//!
//! GNU bc 1.08.2 — arbitrary-precision calculator language.

import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://ftp.gnu.org/gnu/bc/bc-1.08.2.tar.gz",
  hash: "3b1391fbcea440b4abd0c7296a97f6de9b564659320038ff4c3bc7cbc9f5dcee",
});

await importToStore(recipe);
export const bcSourceRecipe = recipe;
