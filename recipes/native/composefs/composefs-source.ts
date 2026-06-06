//! composefs source download.
//!
//! composefs 1.0.8 — EROFS metadata + overlayfs redirect for content-addressed FHS trees.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/containers/composefs/archive/refs/tags/v1.0.8.tar.gz",
  hash: "9a84b6388d5592d44a64190b3408fbfe7ea0fbd3bea6734eccedf4d4299ed850",
});

export const composefsSourceRecipe = recipe;
