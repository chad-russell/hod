//! Go toolchain source download.
//!
//! Go 1.24.3 — the Go programming language toolchain (prebuilt binary).
//! URL: https://go.dev/dl/go1.24.3.linux-amd64.tar.gz

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://go.dev/dl/go1.24.3.linux-amd64.tar.gz",
  hash: "b9f80dbdf72809d7f94ba930777154a7d444196a74d11219822b0aeaee6f6c8c",
});

export const goSourceRecipe = recipe;
