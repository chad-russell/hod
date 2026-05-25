//! Bun upstream binary download.
//!
//! Bun is currently mid-rewrite and upstream publishes release binaries as the
//! practical distribution artifact. We package the pinned Linux x64 musl
//! baseline build and make it self-contained with Hod's musl runtime.

import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-linux-x64-musl-baseline.zip",
  hash: "eec850fb803d353d54c21963d377878bcf0874378bdfddd5331199958154b93a",
});

await importToStore(recipe);
export const bunSourceRecipe = recipe;
