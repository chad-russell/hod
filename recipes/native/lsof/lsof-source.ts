//! lsof source download.
//!
//! lsof 4.99.6 — list open files.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/lsof-org/lsof/releases/download/4.99.6/lsof-4.99.6.tar.gz",
  hash: "6081dedf841cd61f8a022ff7cbe04ed78918a47dea3c39528c8571474167aa0f",
});

export const lsofSourceRecipe = recipe;
