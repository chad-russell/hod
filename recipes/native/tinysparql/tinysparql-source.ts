//! tinysparql source download.
//!
//! TinySPARQL 3.9.2 — SPARQL triple store library (formerly Tracker).

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.gnome.org/sources/tinysparql/3.9/tinysparql-3.9.2.tar.xz",
  hash: "ee697c94f3bbdfdc936b232383dcf37d10d73a1584c5fba6f02da8f2e47004cd",
});

export const tinysparqlSourceRecipe = recipe;
