//! nano source download.
//!
//! GNU nano 9.0 — a small, friendly text editor inspired by Pico.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.nano-editor.org/dist/v9/nano-9.0.tar.xz",
  hash: "0b1905d417e50c67be9cb347eb0061eb198682b657d445c282a106137ca7171c",
});

export const nanoSourceRecipe = recipe;
