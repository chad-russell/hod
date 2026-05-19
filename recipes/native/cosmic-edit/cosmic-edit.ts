//! cosmic-edit — Text editor for COSMIC desktop.
//!
//! Simple text editor based on cosmic-text with syntax highlighting
//! via syntect. Supports multi-tab editing, search, and more.

import { cosmicApp } from "../../helpers/cosmic.js";
import { CosmicEditSourceRecipe } from "./cosmic-edit-source.js";

export const cosmicEditRecipe = await cosmicApp({
  name: "cosmic-edit",
  source: CosmicEditSourceRecipe,
  // Disable default features to remove systemd deps from cosmic-files dependency
  // Default features: dbus-config, gvfs, wgpu, wayland
  // We want wgpu+wayland but not gvfs (needs gio/glib C deps at runtime)
  cargoFlags: [
    "--no-default-features",
    "--features", "wgpu,wayland,dbus-config",
  ],
});
