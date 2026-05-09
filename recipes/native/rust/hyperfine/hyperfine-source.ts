//! hyperfine source download.
//!
//! hyperfine 1.19.0 — command-line benchmarking tool.

import { download, importToStore } from "../../../../js/src/index.js";

const recipe = await download({
  url: "https://github.com/sharkdp/hyperfine/archive/refs/tags/v1.19.0.tar.gz",
  hash: "ef64d50634dac92bfbfe9fc426c3fbc9927e44ebad5511760e5558eeb590b043",
});

await importToStore(recipe);
export const hyperfineSourceRecipe = recipe;
