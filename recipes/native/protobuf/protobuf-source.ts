//! protoc source download — pre-built protobuf compiler binary (zip).
//!
//! protoc 29.5 — official pre-built binary for Linux x86_64.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/protocolbuffers/protobuf/releases/download/v29.5/protoc-29.5-linux-x86_64.zip",
  hash: "05c067fd371fdae7fca8cb93f4e6400ac873eb910056d8966e8541892a9b5a38",
  format: "zip",
  stripComponents: 0,
});

export const protocSourceRecipe = recipe;
