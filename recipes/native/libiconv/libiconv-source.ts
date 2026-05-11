//! libiconv source download.
//!
//! GNU libiconv 1.19 — character encoding conversion library.
//! Provides the iconv() API and the iconv command-line tool.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://mirrors.kernel.org/gnu/libiconv/libiconv-1.19.tar.gz",
  hash: "6409aefeadbc14a49e9c4983264a3bddbacb281071a5e4fb6dd969bf41d08f52",
});

export const libiconvSourceRecipe = recipe;
