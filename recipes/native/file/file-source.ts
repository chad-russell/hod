//! file source download.
//!
//! file 5.46 — libmagic, the file type identification utility and library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://astron.com/pub/file/file-5.46.tar.gz",
  hash: "b90f74a21efef2d49572add801a2dd450c61e886f9d56af76f9dcb656268edbc",
});

export const fileSourceRecipe = recipe;
