//! cosmic-osd — On-screen display for COSMIC desktop.
//!
//! Shows volume, brightness, and other indicators as an overlay.
//! Also handles polkit authentication agent dialogs.

import { cosmicApp } from "../../helpers/cosmic.js";
import { CosmicOsdSourceRecipe } from "./cosmic-osd-source.js";

export const cosmicOsdRecipe = await cosmicApp({
  name: "cosmic-osd",
  source: CosmicOsdSourceRecipe,
});
