//! libgpg-error source download.
//!
//! libgpg-error 1.61 — common error codes and messages for GnuPG components.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://gnupg.org/ftp/gcrypt/libgpg-error/libgpg-error-1.61.tar.bz2",
  hash: "3d8508a18c55a0442e15eab5110c592b0cb518cd9bd1210c8014bbb37277b9a0",
});

export const libgpgErrorSourceRecipe = recipe;
