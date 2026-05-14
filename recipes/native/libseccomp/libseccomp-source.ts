//! libseccomp source download.
//!
//! libseccomp 2.5.5 — high-level interface to the Linux Kernel's syscall filtering.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/seccomp/libseccomp/releases/download/v2.5.5/libseccomp-2.5.5.tar.gz",
  hash: "517b336898a08a79db13f663df66079bf8dea174e8e1e9d3fdbbb868666a6a2a",
});

export const libseccompSourceRecipe = recipe;
