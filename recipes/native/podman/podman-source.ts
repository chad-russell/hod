//! podman source download.
//!
//! podman 5.8.2 — OCI container engine. Source includes vendor/ directory.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/containers/podman/archive/refs/tags/v5.8.2.tar.gz",
  hash: "b857f76312824b2010dfd5a2a86a3ce0865075a04ee518f72da26fa9278bb50b",
});

export const podmanSourceRecipe = recipe;
