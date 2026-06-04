//! crun source download.
//!
//! crun 1.28 — fast, low-memory OCI container runtime.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/containers/crun/releases/download/1.28/crun-1.28.tar.gz",
  hash: "7ddb6a44570d65c09f9dd5e0a94b36ca14bee556645801cccdb3cfc20217d487",
});

export const crunSourceRecipe = recipe;
