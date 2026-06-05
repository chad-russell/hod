//! libassuan source download.
//!
//! libassuan 3.0.2 — IPC library used by GnuPG components.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://gnupg.org/ftp/gcrypt/libassuan/libassuan-3.0.2.tar.bz2",
  hash: "c96b4e82157b358d889159b335f6f674e3da0ce8d2b37775e306d6a2bb111897",
});

export const libassuanSourceRecipe = recipe;
