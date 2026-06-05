//! gpgme source download.
//!
//! GPGME 1.24.2 — GnuPG Made Easy, library for GnuPG integration.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://gnupg.org/ftp/gcrypt/gpgme/gpgme-1.24.2.tar.bz2",
  hash: "b68eced9df7aff518b245185a5d786673f0c872f7c9f04f31ddd3f5651719295",
});

export const gpgmeSourceRecipe = recipe;
