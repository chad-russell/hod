//! cosmic-idle — Idle detection and screen blanking for COSMIC desktop.
//!
//! Monitors user activity and triggers idle actions (screen blanking,
//! locking, etc.). Uses Wayland protocols for idle management.

import { cosmicApp } from "../../helpers/cosmic.js";
import { CosmicIdleSourceRecipe } from "./cosmic-idle-source.js";

export const cosmicIdleRecipe = await cosmicApp({
  name: "cosmic-idle",
  source: CosmicIdleSourceRecipe,
});
