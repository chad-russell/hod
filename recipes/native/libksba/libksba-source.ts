//! libksba source download.
//!
//! libksba 1.8.0 — X.509 and CMS library.
//! Required by gnupg for certificate handling.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://gnupg.org/ftp/gcrypt/libksba/libksba-1.8.0.tar.bz2",
  hash: "1ae65c16488b982448f238839466b21d32456f457769480ba27c0619e8804254",
});

export const libksbaSourceRecipe = recipe;
