//! lz4 source download.
//!
//! LZ4 1.10.0 — extremely fast compression library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/lz4/lz4/releases/download/v1.10.0/lz4-1.10.0.tar.gz",
  hash: "3e69fd475e7852e17594985528b5232afeba7d3d56cfebe2e89071768b2ab36a",
});

export const lz4SourceRecipe = recipe;
