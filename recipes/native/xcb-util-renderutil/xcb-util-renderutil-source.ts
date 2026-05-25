//! xcb-util-renderutil source download.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://xcb.freedesktop.org/dist/xcb-util-renderutil-0.3.10.tar.xz",
  hash: "085c94d08bd8181512d4ce93cf0e5bcd48cd8ed983bbb7a7bcb3a3c2312a08ea",
});

export const xcbUtilRenderutilSourceRecipe = recipe;
