//! util-linux source download.
//!
//! util-linux 2.42.1 — system utilities (libblkid, libuuid, libmount, etc.).

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/util-linux/util-linux/archive/v2.42.1.tar.gz",
  hash: "1d251674f5f6fda4125064b879056bd55e7d3cf203edf81cc6201991c9998376",
});

export const utilLinuxSourceRecipe = recipe;
