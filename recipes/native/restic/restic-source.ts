//! restic source download.
//!
//! restic/restic v0.18.1 — fast, secure, efficient backup program.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/restic/restic/archive/refs/tags/v0.18.1.tar.gz",
  hash: "0a0332c514812df6b68e7e862a9816c8a2be58902c8f1213125036a98c05f675",
});

export const resticSourceRecipe = recipe;
