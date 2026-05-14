//! Go toolchain source download.
//!
//! Go 1.26.3 — the Go programming language toolchain (prebuilt binary).
//! URL: https://go.dev/dl/go1.26.3.linux-amd64.tar.gz

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://go.dev/dl/go1.26.3.linux-amd64.tar.gz",
  hash: "17a2d10cb58b58096652cae9090d61d2cb15e2657ef0e9ac6b0a913e0b3de42a",
});

export const goSourceRecipe = recipe;
