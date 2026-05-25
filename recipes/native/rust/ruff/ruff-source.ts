//! Ruff source download.
//!
//! Ruff 0.14.6 — Python linter and formatter.

import { fetchTarball } from "../../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/astral-sh/ruff/archive/refs/tags/0.14.6.tar.gz",
  hash: "dbce9a2490fda0db08b74fc91aeda4ebe0ff40e58457a5986c6afd84bd3ee30d",
});

export const ruffSourceRecipe = recipe;
