//! wayland-protocols source download.
//!
//! Wayland Protocols 1.48 — standard Wayland protocol XML files.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://gitlab.freedesktop.org/wayland/wayland-protocols/-/releases/1.48/downloads/wayland-protocols-1.48.tar.xz",
  hash: "1655087f2c4d84e552ea3ca8471c8f1696922c7340170c8ea748dbd6a25337f0",
});

export const waylandProtocolsSourceRecipe = recipe;
