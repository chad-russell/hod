//! lsof source download.
//!
//! lsof 4.99.6 — list open files.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/lsof-org/lsof/releases/download/4.99.6/lsof-4.99.6.tar.gz",
  hash: "295b34b36ae0c6e21356dbe30d21b34a57a92e13dbfc9f495dd433d69814a2e6",
});

export const lsofSourceRecipe = recipe;
