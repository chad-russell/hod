//! e2fsprogs source download.
//!
//! e2fsprogs 1.47.4 — ext2/3/4 filesystem utilities. We build only the
//! e2p library (ext2 partition attributes) needed by ostree.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/tytso/e2fsprogs/archive/refs/tags/v1.47.4.tar.gz",
  hash: "f7a8e47875891018fb9d71562565d2bb155da5f620bc7f94a0efd9deac32e6c0",
});

export const e2fsprogsSourceRecipe = recipe;
