//! perl source download.
//!
//! Perl is required by OpenSSL's Configure script and other build systems.
import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.cpan.org/src/5.0/perl-5.40.0.tar.gz",
  hash: "8bfcbb999e0795a64ca90e1ba7308f49c30ab2619ffa25fa425527c4bfca5e0f",
});

export const perlSourceRecipe = recipe;
