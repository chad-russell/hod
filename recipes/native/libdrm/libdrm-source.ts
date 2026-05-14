//! libdrm source download.
//!
//! libdrm 2.4.124 — userspace interface to kernel DRM services.
//! Required by GTK4 on Linux for DRM fourcc headers.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://dri.freedesktop.org/libdrm/libdrm-2.4.124.tar.xz",
  hash: "12ac36a801c1a7c30b649797d64ebd18f50a87f7c840d9096822d6063355ee18",
});

export const libdrmSourceRecipe = recipe;
