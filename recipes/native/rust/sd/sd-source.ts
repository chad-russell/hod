//! sd source download.
//!
//! sd 1.1.0 — intuitive find & replace CLI (modern sed alternative).

import { fetchTarball } from "../../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/chmln/sd/archive/refs/tags/v1.1.0.tar.gz",
  hash: "cdf3d65686e98b1cd03cefc185a9da629462554718332ac587e209fbe0afdd1a",
});

export const sdSourceRecipe = recipe;
