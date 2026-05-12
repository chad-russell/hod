//! wget source download.
//!
//! GNU Wget 1.25.0 — the classic non-interactive network downloader.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://mirror.koddos.net/gnu/wget/wget-1.25.0.tar.gz",
  hash: "be2581f92173acf6d7e74f0c167b5c59da21b1f44a468b4608dd243a10c0857e",
});

export const wgetSourceRecipe = recipe;
