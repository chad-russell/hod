//! at-spi2-core source download.
//!
//! at-spi2-core 2.54.1 — accessibility infrastructure (provides atk-bridge-2.0).

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.gnome.org/sources/at-spi2-core/2.54/at-spi2-core-2.54.1.tar.xz",
  hash: "55e0d8bef75ece01e378421962bb51109bef7b807e765bd9fc368f63c9684319",
});

export const atSpi2CoreSourceRecipe = recipe;
