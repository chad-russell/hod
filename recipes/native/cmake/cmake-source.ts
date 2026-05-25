//! CMake source download.
//!
//! Fixed-output fetch of the upstream CMake source tarball. This keeps the
//! build hermetic across host distros: no host CMake package is required.

import { fetchTarball } from "../../../js/src/index.js";

export const cmakeSourceRecipe = await fetchTarball({
  url: "https://github.com/Kitware/CMake/releases/download/v3.31.6/cmake-3.31.6.tar.gz",
  hash: "5cfb6fc8294396b34a5e52826a67da33ad142159616ba221580964ae23e0bf01",
});
