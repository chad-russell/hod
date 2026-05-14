//! libjpeg-turbo source download.
//!
//! libjpeg-turbo 3.1.0 — JPEG image codec with SIMD acceleration.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/libjpeg-turbo/libjpeg-turbo/releases/download/3.1.0/libjpeg-turbo-3.1.0.tar.gz",
  hash: "3efc14da55c56fc0a6a50f109d9e1ee8a91f5ae7dd17a21d3aebe04a65f3ee96",
});

export const libjpegTurboSourceRecipe = recipe;
