//! zellij source download.
//!
//! zellij 0.44.3 — modern terminal multiplexer with WASM plugin support.

import { fetchTarball } from "../../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/zellij-org/zellij/archive/refs/tags/v0.44.3.tar.gz",
  hash: "b8ecb8a1e37392ec5f327330251d979e85ebd615ad2f183881f02a9cf5b9d552",
});

export const zellijSourceRecipe = recipe;
