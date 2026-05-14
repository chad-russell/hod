//! oh-my-posh source download.
//!
//! JanDeDobbeleer/oh-my-posh v29.13.1 — customisable cross-platform/shell prompt renderer.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/JanDeDobbeleer/oh-my-posh/archive/refs/tags/v29.13.1.tar.gz",
  hash: "25b828f176b028f8dea73c9389bca7627f77a0cd59206bd9e1603b83fe648a28",
});

export const ohMyPoshSourceRecipe = recipe;
