//! cosmic-settings-daemon — D-Bus settings broadcast service for COSMIC desktop.
//!
//! Monitors and broadcasts system settings changes over D-Bus.
//! Other COSMIC components subscribe to these broadcasts.

import { cosmicApp } from "../../helpers/cosmic.js";
import { CosmicSettingsDaemonSourceRecipe } from "./cosmic-settings-daemon-source.js";

export const cosmicSettingsDaemonRecipe = await cosmicApp({
  name: "cosmic-settings-daemon",
  source: CosmicSettingsDaemonSourceRecipe,
});
