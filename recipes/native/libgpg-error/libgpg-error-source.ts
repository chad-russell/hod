//! libgpg-error source download.
//!
//! libgpg-error 1.54 — common error codes and messages for GnuPG components.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://gnupg.org/ftp/gcrypt/libgpg-error/libgpg-error-1.54.tar.bz2",
  hash: "3992e05dc66c1940b7f3108708505aca48f59a39e0f3e301041c23359b5a7811",
});

export const libgpgErrorSourceRecipe = recipe;
