//! bubblewrap source download.
//!
//! bubblewrap 0.11.2 — unprivileged sandboxing tool for Linux.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/containers/bubblewrap/releases/download/v0.11.2/bubblewrap-0.11.2.tar.xz",
  hash: "84bbaab8e6674e165401e96d0d3f342015dc043b2528ae30c1da039fb6a06c80",
});

export const bubblewrapSourceRecipe = recipe;
