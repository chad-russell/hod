//! cosmic-bg — Wallpaper rendering service for COSMIC desktop.
//!
//! Sets the desktop background/wallpaper image. Uses smithay-client-toolkit
//! for Wayland client communication. Pure Rust with no special C deps beyond
//! the standard fontconfig/freetype stack.

import { cosmicApp } from "../../helpers/cosmic.js";
import { CosmicBgSourceRecipe } from "./cosmic-bg-source.js";

export const cosmicBgRecipe = await cosmicApp({
  name: "cosmic-bg",
  source: CosmicBgSourceRecipe,
});
