//! rsync source download.
//!
//! rsync 3.3.0 — fast incremental file transfer utility.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.samba.org/pub/rsync/src/rsync-3.3.0.tar.gz",
  hash: "160094c64e252650f769159948161f7aafed5167f79dae50b1c52de914293b69",
});

export const rsyncSourceRecipe = recipe;
