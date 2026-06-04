//! conmon source download.
//!
//! conmon 2.2.1 — OCI container runtime monitor.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/containers/conmon/archive/refs/tags/v2.2.1.tar.gz",
  hash: "8a3991198b9927c60670fc9a4dd5b9b33cb713c75e61ef7b80c7ed532f5c49d4",
});

export const conmonSourceRecipe = recipe;
