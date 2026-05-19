//! mtdev source download.
//!
//! mtdev 1.1.7 — Multitouch Protocol Translation Library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://bitmath.se/org/code/mtdev/mtdev-1.1.7.tar.gz",
  hash: "dae1dc42c7e28f510c1c9a2da9d4b2025826208ddcfd6949a7b0316d77474f81",
});

export const mtdevSourceRecipe = recipe;
