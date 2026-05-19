//! cosmic-launcher — Application launcher for COSMIC desktop.
//!
//! Search + grid app launcher. Depends on pop-launcher service for
//! search functionality.

import { cosmicApp } from "../../helpers/cosmic.js";
import { CosmicLauncherSourceRecipe } from "./cosmic-launcher-source.js";

export const cosmicLauncherRecipe = await cosmicApp({
  name: "cosmic-launcher",
  source: CosmicLauncherSourceRecipe,
  // Default features include desktop-systemd-scope in libcosmic dep
  // tracing-journald also needs systemd — disable defaults
  cargoFlags: [],
});
