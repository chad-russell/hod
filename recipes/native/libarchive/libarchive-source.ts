//! libarchive source download.
//!
//! Libarchive 3.7.7 — multi-format archive and compression library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/libarchive/libarchive/releases/download/v3.7.7/libarchive-3.7.7.tar.xz",
  hash: "6e92274d5e3bfe782749ecbf473f8e3ae910ec1fad5b64ba6d1b518ab2cf12c3",
});

export const libarchiveSourceRecipe = recipe;
