//! GMP source download.
//!
//! GNU Multiple Precision Arithmetic Library 6.3.0.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://ftp.gnu.org/gnu/gmp/gmp-6.3.0.tar.xz",
  hash: "fffe4996713928ae19331c8ef39129e46d3bf5b7182820656fd4639435cd83a4",
});

export const gmpSourceRecipe = recipe;
