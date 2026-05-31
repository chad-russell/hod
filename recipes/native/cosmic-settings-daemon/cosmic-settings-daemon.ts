//! cosmic-settings-daemon — D-Bus settings broadcast service for COSMIC desktop.
//!
//! Monitors and broadcasts system settings changes over D-Bus.
//! Other COSMIC components subscribe to these broadcasts.

import { cosmicApp } from "../../helpers/cosmic.js";
import { CosmicSettingsDaemonSourceRecipe } from "./cosmic-settings-daemon-source.js";

export const cosmicSettingsDaemonRecipe = await cosmicApp({
  name: "cosmic-settings-daemon",
  source: CosmicSettingsDaemonSourceRecipe,
  postInstallScript: `
mkdir -p \
  $OUT/share/cosmic/com.system76.CosmicSettings.Shortcuts/v1 \
  $OUT/share/cosmic/com.system76.CosmicSettings.WindowRules/v1
cp /tmp/build/data/system_actions.ron \
  $OUT/share/cosmic/com.system76.CosmicSettings.Shortcuts/v1/system_actions
printf '{}\n' > \
  $OUT/share/cosmic/com.system76.CosmicSettings.Shortcuts/v1/defaults
printf '{}\n' > \
  $OUT/share/cosmic/com.system76.CosmicSettings.Shortcuts/v1/custom
printf '[]\n' > \
  $OUT/share/cosmic/com.system76.CosmicSettings.WindowRules/v1/tiling_exception_defaults
printf '[]\n' > \
  $OUT/share/cosmic/com.system76.CosmicSettings.WindowRules/v1/tiling_exception_custom
`,
});
