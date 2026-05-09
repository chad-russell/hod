//! pcre2 source download.
//!
//! PCRE2 10.47 — Perl-compatible regular expression library.

import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://github.com/PCRE2Project/pcre2/releases/download/pcre2-10.47/pcre2-10.47.tar.gz",
  hash: "e80086b5f6da0896be2bb6d0d94ba976a6b21a43fddb831a189d2c8c9747d962",
});

await importToStore(recipe);
export const pcre2SourceRecipe = recipe;
