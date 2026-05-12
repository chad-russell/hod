//! procs source download.
//!
//! procs 0.14.11 — a modern replacement for ps written in Rust.

import { fetchTarball } from "../../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/dalance/procs/archive/refs/tags/v0.14.11.tar.gz",
  hash: "00617fffda0520372f10e816161a129a805c78c392de0f161d4bf4a2fe321afa",
});

export const procsSourceRecipe = recipe;
