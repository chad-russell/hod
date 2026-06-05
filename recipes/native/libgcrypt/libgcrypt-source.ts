//! libgcrypt source download.
//!
//! libgcrypt 1.12.2 — general-purpose cryptographic library.
//! Required by gnupg for all crypto operations.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://gnupg.org/ftp/gcrypt/libgcrypt/libgcrypt-1.12.2.tar.bz2",
  hash: "7eab6137f890c1144c280d97ad89ac115d8c54b317e4696f271c172d5133b10f",
});

export const libgcryptSourceRecipe = recipe;
