//! xdg-desktop-portal-cosmic — XDG desktop portal backend for COSMIC.
//!
//! Implements the XDG desktop portal interfaces for COSMIC, enabling
//! sandboxed apps to request file access, screenshots, screen sharing, etc.

import { cosmicApp } from "../../helpers/cosmic.js";
import { XdgDesktopPortalCosmicSourceRecipe } from "./xdg-desktop-portal-cosmic-source.js";

export const xdgDesktopPortalCosmicRecipe = await cosmicApp({
  name: "xdg-desktop-portal-cosmic",
  source: XdgDesktopPortalCosmicSourceRecipe,
  preBuildScript: [
    "sed -i '/^pipewire = { git = \"https:\\/\\/gitlab\\.freedesktop/,/^] }/d' Cargo.toml",
    "sed -i '/^spa_sys = { package/d' Cargo.toml",
    "sed -i '/^pipewire-sys = { git/d' Cargo.toml",
    "sed -i 's/^memmap2 = \"0.9.10\"$/memmap2 = \"0.9.10\"\\npipewire = { version = \"0.9.2\" }/' Cargo.toml",
  ].join("\n"),
});
