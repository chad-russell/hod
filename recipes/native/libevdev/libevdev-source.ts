//! libevdev source download.
//!
//! libevdev/libevdev 1.9.1 — evdev event handling library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://gitlab.freedesktop.org/libevdev/libevdev/-/archive/libevdev-1.9.1/libevdev-libevdev-1.9.1.tar.gz",
  hash: "e99892e26fea90c511b66762e56eb81a068aae2a111dbea50926f98afc06f017",
});

export const libevdevSourceRecipe = recipe;
