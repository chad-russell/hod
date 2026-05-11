//! libevent source download.
//!
//! libevent 2.1.12-stable — event notification library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/libevent/libevent/releases/download/release-2.1.12-stable/libevent-2.1.12-stable.tar.gz",
  hash: "72be05db4f7879f05fe6fd95e485958223c4a0c6d3ffbb50d5ae5ebc82b8cc0c",
});

export const libeventSourceRecipe = recipe;
