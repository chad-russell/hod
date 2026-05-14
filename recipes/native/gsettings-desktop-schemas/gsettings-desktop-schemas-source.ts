//! gsettings-desktop-schemas source download.
//!
//! gsettings-desktop-schemas 48.0 — GNOME desktop GSettings schemas.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.gnome.org/sources/gsettings-desktop-schemas/48/gsettings-desktop-schemas-48.0.tar.xz",
  hash: "3052d0b01ab3be69594f18d023264f8e8798d389ac721b810628bce143ff84e9",
});

export const gsettingsDesktopSchemasSourceRecipe = recipe;
