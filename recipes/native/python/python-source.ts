//! python source download.
//!
//! Python 3.13.13 — the CPython interpreter and standard library.

import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://www.python.org/ftp/python/3.13.13/Python-3.13.13.tar.xz",
  hash: "b5cc2e3933be3e62f80fd17d27fca70ab1423a6d79a5460592afe8421eb05cd8",
});

await importToStore(recipe);
export const pythonSourceRecipe = recipe;
