//! cosmic-term — Terminal emulator for COSMIC desktop.
//!
//! Terminal emulator using alacritty_terminal as the backend, with
//! COSMIC-themed UI via libcosmic. Supports tabs, splits, and more.

import { cosmicApp } from "../../helpers/cosmic.js";
import { CosmicTermSourceRecipe } from "./cosmic-term-source.js";

export const cosmicTermRecipe = await cosmicApp({
  name: "cosmic-term",
  source: CosmicTermSourceRecipe,
  // Default features: dbus-config, wgpu, wayland, password_manager
  // password_manager needs secret-service (D-Bus) — disable for now
  cargoFlags: [
    "--no-default-features",
    "--features", "wgpu,wayland,dbus-config",
  ],
});
