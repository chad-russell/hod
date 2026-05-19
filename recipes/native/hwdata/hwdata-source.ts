//! hwdata source download.
//!
//! vcrhonek/hwdata v0.407 — hardware identification databases (pnp.ids, pci.ids, usb.ids).

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/vcrhonek/hwdata/archive/v0.407.tar.gz",
  hash: "b0be534ab8e7247d34fbfb0c15d84df2c4f81c371a701d495c2915a455ad787a",
});

export const hwdataSourceRecipe = recipe;
