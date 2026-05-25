//! xcb-util-cursor source download.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://xcb.freedesktop.org/dist/xcb-util-cursor-0.1.5.tar.xz",
  hash: "f46b389539d43658fcf10511fae4ef9a4d40856058681e257bdb3b275a127e35",
});

export const xcbUtilCursorSourceRecipe = recipe;
