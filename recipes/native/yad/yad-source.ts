//! yad source download.
//!
//! Yad (Yet Another Dialog) 14.2 — GTK3 dialog tool.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/v1cont/yad/releases/download/v14.2/yad-14.2.tar.xz",
  hash: "2e42edf75a2f5e0ef9459ea6b2009da205e8d6fffc839208b1d7c7d53c3805ac",
});

export const yadSourceRecipe = recipe;
