//! StyLua source download.
//!
//! StyLua 2.3.1 — opinionated Lua code formatter.

import { fetchTarball } from "../../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/JohnnyMorganz/StyLua/archive/refs/tags/v2.3.1.tar.gz",
  hash: "87ba814763b51b87828230fdfea33a17bff0b14259296933dfd0ee5f96f6a8ce",
});

export const styluaSourceRecipe = recipe;
