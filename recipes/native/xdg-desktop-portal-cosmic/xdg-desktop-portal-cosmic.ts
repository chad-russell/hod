//! xdg-desktop-portal-cosmic — XDG desktop portal backend for COSMIC.
//!
//! Implements the XDG desktop portal interfaces for COSMIC, enabling
//! sandboxed apps to request file access, screenshots, screen sharing, etc.

import { cosmicApp } from "../../helpers/cosmic.js";
import { XdgDesktopPortalCosmicSourceRecipe } from "./xdg-desktop-portal-cosmic-source.js";

export const xdgDesktopPortalCosmicRecipe = await cosmicApp({
  name: "xdg-desktop-portal-cosmic",
  source: XdgDesktopPortalCosmicSourceRecipe,
  bindgen: true,
});
