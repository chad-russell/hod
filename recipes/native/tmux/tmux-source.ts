//! tmux source download.
//!
//! tmux 3.6a — terminal multiplexer.

import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://github.com/tmux/tmux/releases/download/3.6a/tmux-3.6a.tar.gz",
  hash: "43a9a5fd4ebe403efccd666c7b620fcf65489b123092df70113466a2b5aedb5a",
});

await importToStore(recipe);
export const tmuxSourceRecipe = recipe;
