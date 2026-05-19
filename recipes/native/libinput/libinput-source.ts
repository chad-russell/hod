//! libinput source download.
//!
//! libinput v1.27.0 — input device management library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://gitlab.freedesktop.org/libinput/libinput/-/archive/1.27.0/libinput-1.27.0.tar.gz",
  hash: "ad337b5345e1b6c2f3ace2bddd8573f07435a2685903fb8c0ecd69ddcc145acd",
});

export const libinputSourceRecipe = recipe;
