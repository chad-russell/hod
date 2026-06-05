//! xdg-dbus-proxy source download.
//!
//! xdg-dbus-proxy 0.1.7 — D-Bus proxy for flatpak sandboxing.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/flatpak/xdg-dbus-proxy/releases/download/0.1.7/xdg-dbus-proxy-0.1.7.tar.xz",
  hash: "50b081d5c54fd53c70dd71b997f1f06400be66043eb6e37c3e7e65a10b69bceb",
});

export const xdgDbusProxySourceRecipe = recipe;
