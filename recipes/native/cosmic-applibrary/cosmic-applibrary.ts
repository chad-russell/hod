//! cosmic-applibrary — Application library view for COSMIC desktop.
//!
//! Grid view of installed applications for the launcher.

import { cosmicApp } from "../../helpers/cosmic.js";
import { CosmicApplibrarySourceRecipe } from "./cosmic-applibrary-source.js";

export const cosmicApplibraryRecipe = await cosmicApp({
  name: "cosmic-app-library",  // binary name has hyphens, not abbreviated
  source: CosmicApplibrarySourceRecipe,
  cargoFlags: [],
});
