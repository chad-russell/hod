//! xkeyboard-config source download.
//!
//! xkeyboard-config 2.43 — X Keyboard configuration data.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.x.org/releases/individual/data/xkeyboard-config/xkeyboard-config-2.43.tar.xz",
  hash: "f8602628ce669ba7d18cb4c754a19b77344a1742dfd4fd979cc8e0723a6548e0",
});

export const xkeyboardConfigSourceRecipe = recipe;
