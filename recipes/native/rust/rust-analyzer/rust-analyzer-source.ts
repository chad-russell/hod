//! rust-analyzer source download.
//!
//! rust-analyzer 2025-05-19 — Rust language server.

import { fetchTarball } from "../../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/rust-lang/rust-analyzer/archive/refs/tags/2025-05-19.tar.gz",
  hash: "ef737d356b3010d3a52e4c4e67614174352ee7e3068ab2ff8a715f683dfe412d",
});

export const rustAnalyzerSourceRecipe = recipe;
