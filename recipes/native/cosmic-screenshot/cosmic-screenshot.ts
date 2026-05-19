//! cosmic-screenshot — Screenshot tool for COSMIC desktop.
//!
//! Takes screenshots of the entire screen, a window, or a selected region.
//! Uses the cosmic-screenshot Wayland protocol.

import { cosmicApp } from "../../helpers/cosmic.js";
import { CosmicScreenshotSourceRecipe } from "./cosmic-screenshot-source.js";

export const cosmicScreenshotRecipe = await cosmicApp({
  name: "cosmic-screenshot",
  source: CosmicScreenshotSourceRecipe,
});
