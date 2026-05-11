//! expat source download.
//!
//! Expat 2.7.1 — a small, fast, stream-oriented C XML parser library.
//! Needed by git (for HTTP), dbus, fontconfig, and many other packages.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/libexpat/libexpat/releases/download/R_2_7_1/expat-2.7.1.tar.xz",
  hash: "5ff48d845cd415a4249dcfd55d2050051e9b5052143655e1329f8dde440f2f7a",
});

export const expatSourceRecipe = recipe;
