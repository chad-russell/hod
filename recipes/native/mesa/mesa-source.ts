//! Mesa source download.
//!
//! Mesa 26.0.7 — open-source graphics library implementing OpenGL, Vulkan,
//! and other graphics APIs. Provides the llvmpipe software rasterizer for
//! GPU rendering in VMs and the GBM (Generic Buffer Manager) library.

import { fetchTarball } from "../../../js/src/index.js";

export const mesaSourceRecipe = await fetchTarball({
  url: "https://mesa3d.org/archive/mesa-26.0.7.tar.xz",
  hash: "0ec4f036604e83986c78e035a4eab3aecccc2bed1b00563884602e04f1b5b015",
});
