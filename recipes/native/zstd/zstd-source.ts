//! zstd source download.
//!
//! Zstandard v1.5.7 — fast real-time compression algorithm and library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/facebook/zstd/releases/download/v1.5.7/zstd-1.5.7.tar.gz",
  hash: "730dca31244abd219e995f03a55d95b2cfb4b3e16cda055a79fa6f30a4f0e1db",
});

export const zstdSourceRecipe = recipe;
