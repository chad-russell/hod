//! watchexec source download.
//!
//! watchexec 2.5.1 — executes commands in response to file modifications.

import { fetchTarball } from "../../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/watchexec/watchexec/archive/refs/tags/v2.5.1.tar.gz",
  hash: "660d1c6c63066bf83ddb3b2c766773353023a924a001dd6c568f26b0d2122ad4",
});

export const watchexecSourceRecipe = recipe;
