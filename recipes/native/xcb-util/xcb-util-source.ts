//! xcb-util source download.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://xcb.freedesktop.org/dist/xcb-util-0.4.1.tar.xz",
  hash: "ebc940220db0ca39a690a47b565ce73ab536c1fbfdebf008fa0edf0ced862aca",
});

export const xcbUtilSourceRecipe = recipe;
