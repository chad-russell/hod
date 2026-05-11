//! bat source download.
//!
//! bat 0.25.0 — a cat(1) clone with syntax highlighting, Git integration,
//! and line numbers.

import { fetchTarball } from "../../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/sharkdp/bat/archive/refs/tags/v0.25.0.tar.gz",
  hash: "011333b5da44d9da8dccea97ae1dec85301de7f5522cd4c4c018528d0a8de519",
});

export const batSourceRecipe = recipe;
