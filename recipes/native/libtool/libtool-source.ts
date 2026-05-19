//! libtool source download.
//!
//! GNU libtool 2.5.4 — generic library support script.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://ftp.gnu.org/gnu/libtool/libtool-2.5.4.tar.xz",
  hash: "07f5880eca816e6ab76da3a69b32df728e0277e96f8da761f69c06157da36a5a",
});

export const libtoolSourceRecipe = recipe;
