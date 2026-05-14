//! wayland source download.
//!
//! Wayland 1.25.0 — the core Wayland window system protocol library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://gitlab.freedesktop.org/wayland/wayland/-/releases/1.25.0/downloads/wayland-1.25.0.tar.xz",
  hash: "e901b1eea94562827cda0a68351db7625340239eacf696d852cc0c6b2a9edcc6",
});

export const waylandSourceRecipe = recipe;
