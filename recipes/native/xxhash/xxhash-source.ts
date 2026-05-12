//! xxHash source download.
//!
//! xxHash v0.8.3 — extremely fast non-cryptographic hash algorithm.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/Cyan4973/xxHash/archive/refs/tags/v0.8.3.tar.gz",
  hash: "64073932284e6076cec589aefbff9df671f8a18042f9ba6474d295179bc5eed2",
});

export const xxhashSourceRecipe = recipe;
