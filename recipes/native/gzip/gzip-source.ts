//! gzip source download.
//!
//! GNU gzip 1.14 — the standard compression/decompression utility.

import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://ftp.gnu.org/gnu/gzip/gzip-1.14.tar.gz",
  hash: "b4ca579afebb342d9c093314cd928d7aeda7cac819f0759e64626865d6213e64",
});

await importToStore(recipe);
export const gzipSourceRecipe = recipe;
