//! unzip source download.
//!
//! Info-ZIP UnZip 6.0 — portable ZIP archive extraction utilities.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://downloads.sourceforge.net/infozip/unzip60.tar.gz",
  hash: "5969810311361d686f6408091d60d0a36bf29f1abfae05831be9c42e69aaf67f",
});

export const unzipSourceRecipe = recipe;
