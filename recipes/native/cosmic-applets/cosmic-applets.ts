//! cosmic-applets — Panel applets for COSMIC desktop.
//!
//! Individual applet binaries for the cosmic-panel: clock, battery,
//! audio, workspace indicator, etc.

import { cosmicApp } from "../../helpers/cosmic.js";
import { CosmicAppletsSourceRecipe } from "./cosmic-applets-source.js";

export const cosmicAppletsRecipe = await cosmicApp({
  name: "cosmic-applet-time",
  source: CosmicAppletsSourceRecipe,
  preBuildScript: `sed -i '/cosmic-protocols\\/\\//s/^/#/' Cargo.toml`,
  cargoFlags: [
    "--no-default-features",
    "-p", "cosmic-applet-battery",
    "-p", "cosmic-applet-bluetooth",
    "-p", "cosmic-applet-minimize",
    "-p", "cosmic-applet-network",
    "-p", "cosmic-applet-notifications",
    "-p", "cosmic-applet-power",
    "-p", "cosmic-applet-status-area",
    "-p", "cosmic-applet-time",
  ],
  extraBinaries: [
    "cosmic-applet-battery",
    "cosmic-applet-bluetooth",
    "cosmic-applet-minimize",
    "cosmic-applet-network",
    "cosmic-applet-notifications",
    "cosmic-applet-power",
    "cosmic-applet-status-area",
    "cosmic-applet-time",
  ],
});
