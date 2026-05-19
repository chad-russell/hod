//! cosmic-panel — Panel (taskbar) for COSMIC desktop.
//!
//! Top panel with applets for system tray, clock, workspace indicator,
//! and application menu. Uses Smithay for Wayland client rendering.

import { cosmicApp } from "../../helpers/cosmic.js";
import { CosmicPanelSourceRecipe } from "./cosmic-panel-source.js";

export const cosmicPanelRecipe = await cosmicApp({
  name: "cosmic-panel",
  source: CosmicPanelSourceRecipe,
  // cosmic-panel uses smithay with DRM/EGL — needs the full graphics stack
  // It also uses tracing-journald which needs systemd — disable default features
});
