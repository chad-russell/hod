//! cosmic-settings — System settings application for COSMIC desktop.
//!
//! Provides configuration for display, network, sound, keyboard, etc.
//! Modular with different pages for each settings category.

import { cosmicApp } from "../../helpers/cosmic.js";
import { CosmicSettingsSourceRecipe } from "./cosmic-settings-source.js";

export const cosmicSettingsRecipe = await cosmicApp({
  name: "cosmic-settings",
  source: CosmicSettingsSourceRecipe,
  preBuildScript: `sed -i '/cosmic-protocols\\/\\//s/^/#/' Cargo.toml`,
});
