//! Distrobox source download.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/89luca89/distrobox/archive/refs/tags/1.8.2.5.tar.gz",
  hash: "d41f8111f775ff061736f80a907e47c3c0f9265a50327e66c2aab7b194f5cf32",
});

export const distroboxSourceRecipe = recipe;
