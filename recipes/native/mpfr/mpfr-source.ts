//! MPFR source download.
//!
//! GNU Multiple-precision floating-point reliable library 4.2.2.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://ftp.gnu.org/gnu/mpfr/mpfr-4.2.2.tar.xz",
  hash: "11d59d061ef8db588650bc7dc5172594a6e5aad013994801c6f63011a62b191d",
});

export const mpfrSourceRecipe = recipe;
