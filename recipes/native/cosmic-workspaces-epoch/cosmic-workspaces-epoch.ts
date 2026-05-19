//! cosmic-workspaces-epoch — Workspace overview for COSMIC desktop.
//!
//! Shows an overview of all workspaces with window previews.
//! Allows switching between workspaces and moving windows.

import { cosmicApp } from "../../helpers/cosmic.js";
import { CosmicWorkspacesEpochSourceRecipe } from "./cosmic-workspaces-epoch-source.js";

export const cosmicWorkspacesEpochRecipe = await cosmicApp({
  name: "cosmic-workspaces",  // binary name differs from repo name
  source: CosmicWorkspacesEpochSourceRecipe,
});
