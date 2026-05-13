//! dbus source download.
//!
//! D-Bus 1.16.2 — inter-process communication system.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://dbus.freedesktop.org/releases/dbus/dbus-1.16.2.tar.xz",
  hash: "b1d1f22858a8f04665e5dca29d194f892620f00fd3e3f4e89dd208e78868436e",
});

export const dbusSourceRecipe = recipe;
