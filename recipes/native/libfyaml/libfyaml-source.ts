//! libfyaml source download.
//!
//! libfyaml 0.9.6 — fully feature-complete YAML parser and emitter.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/pantoniou/libfyaml/releases/download/v0.9.6/libfyaml-0.9.6.tar.gz",
  hash: "18c2deb847c782bcccaabd18bed64a6ad7ab9f900794913bd3b0435b2ddf6112",
});

export const libfyamlSourceRecipe = recipe;
