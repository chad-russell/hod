//! xmlb source download.
//!
//! libxmlb 0.3.21 — library for querying XML files.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/hughsie/libxmlb/releases/download/0.3.21/libxmlb-0.3.21.tar.xz",
  hash: "03ef0f3d18037f2979cf03d2ff4e1d212df1cf0dbff73aed7cfd660ee693cb28",
});

export const xmlbSourceRecipe = recipe;
