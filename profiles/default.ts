//! Default profile — a small set of CLI utilities.
//!
//! This is a test profile with jq (JSON processor), pv (pipe viewer),
//! and tree (directory listing). All are already-built C packages
//! with only the toolchain as a runtime dependency.

import { jqRecipe } from "../recipes/native/jq/jq.js";
import { pvRecipe } from "../recipes/native/pv/pv.js";
import { treeRecipe } from "../recipes/native/tree/tree.js";

export const profile = {
  name: "default",
  packages: [jqRecipe, pvRecipe, treeRecipe],
};
