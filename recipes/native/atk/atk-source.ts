//! atk source download.
//!
//! ATK 2.38.0 — accessibility toolkit used by GTK3.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.gnome.org/sources/atk/2.38/atk-2.38.0.tar.xz",
  hash: "cbc1b7ba03009ee5cc0e646d8a86117e0d65bf8d105f2e8714fbde0299a8012e",
});

export const atkSourceRecipe = recipe;
