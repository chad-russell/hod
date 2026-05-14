//! lazygit source download.
//!
//! jesseduffield/lazygit v0.55.1 — simple terminal UI for git commands.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/jesseduffield/lazygit/archive/refs/tags/v0.55.1.tar.gz",
  hash: "e80ffa9908f66998171dbe9be7f55f8571f79bf41330c74c8f08d6359a0f050b",
});

export const lazygitSourceRecipe = recipe;
