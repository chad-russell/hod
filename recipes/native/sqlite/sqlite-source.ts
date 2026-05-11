//! sqlite source download.
//!
//! SQLite 3.53.1 — self-contained SQL database engine (autoconf amalgamation).

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.sqlite.org/2026/sqlite-autoconf-3530100.tar.gz",
  hash: "a6ae6bb1e46b6866539b7c2ca905521357a12dadc72c924e2ea7d54201985512",
});

export const sqliteSourceRecipe = recipe;
