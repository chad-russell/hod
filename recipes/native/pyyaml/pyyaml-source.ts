//! PyYAML source download.
//!
//! PyYAML 6.0.2 — YAML parser and emitter for Python.
//! Required by Mesa's build system for format table generation.

import { fetchTarball } from "../../../js/src/index.js";

export const pyyamlSourceRecipe = await fetchTarball({
  url: "https://files.pythonhosted.org/packages/54/ed/79a089b6be93607fa5cdaedf301d7dfb23af5f25c398d5ead2525b063e17/pyyaml-6.0.2.tar.gz",
  hash: "a6a4a4ed1e5b2243a332f6189966c8a7c836079f0a15876499b877e819550519",
});
