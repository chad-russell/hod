//! graphene source download.
//!
//! Graphene 1.10.8 — a thin layer of graphic data types (vectors, matrices, quaternions).

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.gnome.org/sources/graphene/1.10/graphene-1.10.8.tar.xz",
  hash: "03eb8c40d25df4875acf0922e386c0fb4720189ff3ad22346d5659aea4647c7f",
});

export const grapheneSourceRecipe = recipe;
