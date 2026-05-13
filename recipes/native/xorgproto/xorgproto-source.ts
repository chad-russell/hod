//! xorgproto source download.
//!
//! xorgproto 2024.1 — X Window System unified protocol headers.
//! Provides headers for all X11 core and extension protocols.

import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.x.org/releases/individual/proto/xorgproto-2024.1.tar.xz",
  hash: "fad667bb04e16dca5e816969f2641bb075929cd73564114cc1aabd87d1975dd3",
});

await importToStore(recipe);
export const xorgprotoSourceRecipe = recipe;
