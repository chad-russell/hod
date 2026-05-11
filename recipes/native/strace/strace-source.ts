//! strace source download.
//!
//! strace 7.0 — the Linux syscall tracer.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/strace/strace/releases/download/v7.0/strace-7.0.tar.xz",
  hash: "c473716d7aea8a9183992284f37ff5b9db9d6c51118d41b8c9e9cc35a3055cf5",
});

export const straceSourceRecipe = recipe;
