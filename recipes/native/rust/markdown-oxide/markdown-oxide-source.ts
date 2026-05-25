//! Markdown Oxide source download.
//!
//! Markdown Oxide 0.25.8 — Markdown language server.

import { fetchTarball } from "../../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/Feel-ix-343/markdown-oxide/archive/refs/tags/v0.25.8.tar.gz",
  hash: "624006a405916e9869f2b17c8df9dd5d23fd40e0bd0ca3d6ada8faafc5f701dd",
});

export const markdownOxideSourceRecipe = recipe;
