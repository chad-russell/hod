//! libpsl source download.
//!
//! libpsl 0.21.5 — C library for the Public Suffix List.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/rockdaboot/libpsl/releases/download/0.21.5/libpsl-0.21.5.tar.gz",
  hash: "75520a5e4ef205ad5fcb236075182c9e7aeb4f3122ebdb32854a14f49dc52676",
});

export const libpslSourceRecipe = recipe;
