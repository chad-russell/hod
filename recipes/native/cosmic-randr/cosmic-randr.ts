//! cosmic-randr — Display configuration utility for COSMIC desktop.
//!
//! CLI and library for configuring display outputs (resolution, refresh rate,
//! position, scale, etc.). Uses cosmic-randr Wayland protocol.

import { cosmicApp } from "../../helpers/cosmic.js";
import { CosmicRandrSourceRecipe } from "./cosmic-randr-source.js";

export const cosmicRandrRecipe = await cosmicApp({
  name: "cosmic-randr",
  source: CosmicRandrSourceRecipe,
  // cosmic-randr is a workspace: cli (bin: cosmic-randr), lib, shell (lib)
  // The shell member is a library, not a binary — don't include it
});
