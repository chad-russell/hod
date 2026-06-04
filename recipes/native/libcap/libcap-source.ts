//! libcap source download.
//!
//! libcap 2.78 — POSIX.1e capabilities library and utilities.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://kernel.org/pub/linux/libs/security/linux-privs/libcap2/libcap-2.78.tar.xz",
  hash: "8309d1f55e89be484baa938d4a5ec1d661fdf66d639f7a4e99d5c6e4893f9c79",
});

export const libcapSourceRecipe = recipe;
