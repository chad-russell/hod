//! npth source download.
//!
//! npth 1.8 — GNU portable threads library.
//! Required by gnupg for threading.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://gnupg.org/ftp/gcrypt/npth/npth-1.8.tar.bz2",
  hash: "cac4aa343cb1d426a913b29cb1692b6145dd530c9e1896696cd6e85872b3df03",
});

export const npthSourceRecipe = recipe;
