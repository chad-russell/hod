//! eudev source download.
//!
//! eudev v3.2.14 — standalone udev implementation (provides libudev).

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/eudev-project/eudev/archive/refs/tags/v3.2.14.tar.gz",
  hash: "764caedfa292b3ed8fe90bca862ef13e04c69019358e30d1b6c163daa2d620cd",
});

export const eudevSourceRecipe = recipe;
