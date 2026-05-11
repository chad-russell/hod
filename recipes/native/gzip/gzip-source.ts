//! gzip source download.
//!
//! GNU gzip 1.14 — the standard compression/decompression utility.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://mirrors.kernel.org/gnu/gzip/gzip-1.14.tar.gz",
  hash: "b4ca579afebb342d9c093314cd928d7aeda7cac819f0759e64626865d6213e64",
});

export const gzipSourceRecipe = recipe;
