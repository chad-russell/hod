//! fribidi source download.
//!
//! FriBidi 1.0.16 — Unicode bidirectional algorithm library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/fribidi/fribidi/releases/download/v1.0.16/fribidi-1.0.16.tar.xz",
  hash: "c16ee250f73f149d7d52dc7d285eb73ac755bad7907d237391e23f429b2b71d5",
});

export const fribidiSourceRecipe = recipe;
