//! ThinkPad GUI/Wayland profile — graphical apps and desktop utilities.
//!
//! Keep this separate from the daily CLI profile because GUI closures are
//! larger and need more runtime smoke testing after transfer.

import { alacrittyRecipe } from "../recipes/native/alacritty/alacritty.js";
import { brightnessctlRecipe } from "../recipes/native/brightnessctl/brightnessctl.js";
import { grimRecipe } from "../recipes/native/grim/grim.js";
import { playerctlRecipe } from "../recipes/native/playerctl/playerctl.js";
import { slurpRecipe } from "../recipes/native/slurp/slurp.js";
import { wlClipboardRecipe } from "../recipes/native/wl-clipboard/wl-clipboard.js";
import { wireplumberRecipe } from "../recipes/native/wireplumber/wireplumber.js";
import { xwaylandSatelliteRecipe } from "../recipes/native/xwayland-satellite/xwayland-satellite.js";

export const profile = {
  name: "thinkpad-gui",
  packages: [
    { name: "alacritty", recipe: alacrittyRecipe },
    { name: "brightnessctl", recipe: brightnessctlRecipe },
    { name: "grim", recipe: grimRecipe },
    { name: "playerctl", recipe: playerctlRecipe },
    { name: "slurp", recipe: slurpRecipe },
    { name: "wl-clipboard", recipe: wlClipboardRecipe },
    { name: "wireplumber", recipe: wireplumberRecipe },
    { name: "xwayland-satellite", recipe: xwaylandSatelliteRecipe },
  ],
};
