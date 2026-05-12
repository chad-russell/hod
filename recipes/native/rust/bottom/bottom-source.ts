//! bottom source download.
//!
//! ClementTsang/bottom 0.12.3 — a customizable cross-platform graphical
//! process/system monitor for the terminal (a modern htop alternative).

import { fetchTarball } from "../../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/ClementTsang/bottom/archive/refs/tags/0.12.3.tar.gz",
  hash: "5d54b41e2abb412b5412a27592899fabb11c5388810e8fc231477f8e75c05226",
});

export const bottomSourceRecipe = recipe;
