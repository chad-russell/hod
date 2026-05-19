//! cosmic-session — Session manager for COSMIC desktop.
//!
//! Manages the desktop session lifecycle: starts the compositor (cosmic-comp),
//! panel, launcher, settings daemon, and all other desktop services.
//! Also handles autostart applications.

import { cosmicApp } from "../../helpers/cosmic.js";
import { CosmicSessionSourceRecipe } from "./cosmic-session-source.js";

export const cosmicSessionRecipe = await cosmicApp({
  name: "cosmic-session",
  source: CosmicSessionSourceRecipe,
  // cosmic-session has a bug: the "autostart" feature calls is_systemd_used()
  // which is gated behind #[cfg(feature = "systemd")], causing a compile error
  // when autostart is enabled without systemd. For now, disable autostart too.
  cargoFlags: [
    "--no-default-features",
  ],
});
