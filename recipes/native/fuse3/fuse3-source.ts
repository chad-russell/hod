//! fuse3 source download.
//!
//! libfuse 3.18.2 — FUSE (Filesystem in Userspace) library and utilities.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/libfuse/libfuse/releases/download/fuse-3.18.2/fuse-3.18.2.tar.gz",
  hash: "8d10a06f56940d0c560619d030391a1aceb505d6afa041f004420806c71a71de",
});

export const fuse3SourceRecipe = recipe;
