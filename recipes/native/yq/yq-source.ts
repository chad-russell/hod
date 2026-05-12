//! yq source download.
//!
//! mikefarah/yq v4.45.1 — a portable command-line YAML, JSON, XML, CSV,
//! TOML and properties processor.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/mikefarah/yq/archive/refs/tags/v4.45.1.tar.gz",
  hash: "0e6dcbae35603db43bd63530571c7e4f54b8549fd9a07608db1fc0a0c30faac8",
});

export const yqSourceRecipe = recipe;
