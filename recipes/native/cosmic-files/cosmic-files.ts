//! cosmic-files — File manager for COSMIC desktop.
//!
//! File manager with tabs, dual-pane view, and support for browsing
//! archives. Uses libcosmic for the UI.

import { cosmicApp } from "../../helpers/cosmic.js";
import { CosmicFilesSourceRecipe } from "./cosmic-files-source.js";

export const cosmicFilesRecipe = await cosmicApp({
  name: "cosmic-files",
  source: CosmicFilesSourceRecipe,
  // Default features include gvfs (gio/glib C runtime dep), io-uring, bzip2,
  // notify, wayland, wgpu, dbus-config
  // Disable gvfs to avoid gio/glib runtime dep complexity
  // io-uring needs io_uring kernel support — disable for VM safety
  // cosmic-files-applet needs gvfs feature — skip it
  cargoFlags: [
    "--no-default-features",
    "--features", "wgpu,wayland,dbus-config,bzip2,desktop,notify",
  ],
});
