//! seatd source download.
//!
//! seatd 0.9.3 — minimal seat management daemon and library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://git.sr.ht/~kennylevinsen/seatd/archive/0.9.3.tar.gz",
  hash: "c1653dc2766e90c1fa606869f527085d939e13a84369bfad0f6762deeada152c",
});

export const seatdSourceRecipe = recipe;
