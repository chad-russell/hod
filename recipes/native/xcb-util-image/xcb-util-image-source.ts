//! xcb-util-image source download.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://xcb.freedesktop.org/dist/xcb-util-image-0.4.1.tar.xz",
  hash: "c8a0652f7c215bd312d9f238aed2ba6a122f087b623dafbbac4456f5351df603",
});

export const xcbUtilImageSourceRecipe = recipe;
