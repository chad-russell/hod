//! brightnessctl source download.
//!
//! Hummer12007/brightnessctl 0.5.1 — read and control device brightness on Linux.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/Hummer12007/brightnessctl/archive/refs/tags/0.5.1.tar.gz",
  hash: "8fc390a9b9d261a5d479c18d7b9d09948acf8c269d6d9a502e5617b339175e50",
});

export const brightnessctlSourceRecipe = recipe;
