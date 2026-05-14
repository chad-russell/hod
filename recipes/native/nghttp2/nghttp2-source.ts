//! nghttp2 source download.
//!
//! nghttp2 1.69.0 — HTTP/2 C library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/nghttp2/nghttp2/releases/download/v1.69.0/nghttp2-1.69.0.tar.xz",
  hash: "dd7432762ac454aaa14ff3b29d40d5b8f641ec3c33e4e24c5ed70e971ac6987b",
});

export const nghttp2SourceRecipe = recipe;
