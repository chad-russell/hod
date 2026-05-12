//! patchelf source download.
//!
//! patchelf 0.15.0 — utility to modify ELF executables (RPATH, interpreter, soname).

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/NixOS/patchelf/archive/refs/tags/0.15.0.tar.gz",
  hash: "5145f16a8d09ddcad83b1d0355ee527608da608d099497f1cfc13e219d95513c",
});

export const patchelfSourceRecipe = recipe;
