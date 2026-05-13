//! shared-mime-info source download.
//!
//! shared-mime-info 2.4 — freedesktop.org shared MIME database.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://gitlab.freedesktop.org/xdg/shared-mime-info/-/archive/2.4/shared-mime-info-2.4.tar.gz",
  hash: "ad130f2f923ab3d5455c643e6257abf3598339fdd134ad0fac4e5dbbbf070eb9",
});

export const sharedMimeInfoSourceRecipe = recipe;
