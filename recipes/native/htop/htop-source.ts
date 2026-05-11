//! htop source download.
//!
//! htop 3.5.1 — interactive process viewer.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/htop-dev/htop/releases/download/3.5.1/htop-3.5.1.tar.xz",
  hash: "f5a60d68daabacbe9e5039112ba2daaf0017bc14d276f82a60cb137c515ef3f4",
});

export const htopSourceRecipe = recipe;
