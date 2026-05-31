//! cosmic-comp — Wayland compositor for COSMIC desktop.
//!
//! Builds cosmic-comp epoch-1.0.13 from source. This is the core compositor
//! built on Smithay + wgpu, handling display management, window management,
//! and input handling.
//!
//! Uses the shared cosmicApp() helper which provides the standard COSMIC
//! dependency stack (fontconfig/freetype/harfbuzz, wayland, DRM/EGL, X11, etc.)
//! and the correct set of runtime_deps for closure transfer.
//!
//! Default features are disabled (removes systemd/logind dependency).
//! COSMIC uses seatd for seat management instead.

import { cosmicApp } from "../../helpers/cosmic.js";
import { cosmicCompSourceRecipe } from "./cosmic-comp-source.js";

export const cosmicCompRecipe = await cosmicApp({
  name: "cosmic-comp",
  source: cosmicCompSourceRecipe,
});
