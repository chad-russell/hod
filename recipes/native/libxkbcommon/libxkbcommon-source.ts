//! libxkbcommon source download.
//!
//! xkbcommon/libxkbcommon 1.9.2 — keymap handling library for XKB (X Keyboard Extension).

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/xkbcommon/libxkbcommon/archive/refs/tags/xkbcommon-1.9.2.tar.gz",
  hash: "ddd56e1ac38ad9635bf8f8eb42c3c397144753a5c3bc77e387127a1a999945d7",
});

export const libxkbcommonSourceRecipe = recipe;
