//! pop-launcher — Launcher service and plugin framework for COSMIC desktop.
//!
//! Backend service that provides app search, calculation, and other
//! launcher functionality via a plugin system.

import { cosmicApp } from "../../helpers/cosmic.js";
import { PopLauncherSourceRecipe } from "./pop-launcher-source.js";

export const popLauncherRecipe = await cosmicApp({
  name: "pop-launcher-bin",  // workspace bin crate name
  source: PopLauncherSourceRecipe,
  // pop-launcher has plugins that use cosmic-client-toolkit (wayland)
  // and reqwest with rustls-tls (no openssl needed)
  // Must specify -p pop-launcher-bin to build the binary from the workspace
  cargoFlags: ["-p", "pop-launcher-bin"],
});
