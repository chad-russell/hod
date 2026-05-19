//! libglvnd source download.
//!
//! EGL/GL vendor-neutral dispatch library. Provides libEGL, libGL, libGLESv2
//! as vendor-neutral dispatchers that can load Mesa or proprietary drivers.

import { fetchTarball } from "../../../js/src/index.js";

export const libglvndSourceRecipe = await fetchTarball({
  url: "https://gitlab.freedesktop.org/glvnd/libglvnd/-/archive/v1.7.0/libglvnd-v1.7.0.tar.gz",
  hash: "08459ce54c574683038ce1c9c8e39447d92a8cc78bb13a4c5af0457bf38af2d4",
});
