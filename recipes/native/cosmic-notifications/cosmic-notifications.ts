//! cosmic-notifications — Notification daemon for COSMIC desktop.
//!
//! Displays desktop notifications using the COSMIC notification protocol.
//! Integrates with the panel for the notification tray.

import { cosmicApp } from "../../helpers/cosmic.js";
import { CosmicNotificationsSourceRecipe } from "./cosmic-notifications-source.js";

export const cosmicNotificationsRecipe = await cosmicApp({
  name: "cosmic-notifications",
  source: CosmicNotificationsSourceRecipe,
});
