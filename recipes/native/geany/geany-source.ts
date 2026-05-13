//! geany source download.
//!
//! Geany 2.1 — lightweight GTK3 IDE / text editor.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.geany.org/geany-2.1.tar.gz",
  hash: "aa6266691370ae87b722e15a0f3a84484eb9f2d3cdfef58b00359a86a9821252",
});

export const geanySourceRecipe = recipe;
