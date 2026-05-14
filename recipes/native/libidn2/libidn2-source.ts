//! libidn2 source download.
//!
//! libidn2 2.3.7 — Internationalized domain names library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://ftp.gnu.org/gnu/libidn/libidn2-2.3.7.tar.gz",
  hash: "6859e4da5ae94b12df8969673265f88edbcdc48bd16b3f3388f9cc1a287159d3",
});

export const libidn2SourceRecipe = recipe;
