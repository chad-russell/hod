//! libjpeg (IJG) source download.
//!
//! IJG libjpeg 9e — JPEG image compression library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.ijg.org/files/jpegsrc.v9e.tar.gz",
  hash: "f0d6072e15de609397cbd8428758d7054dd921dc448018111e3822b17bcbcc5d",
});

export const libjpegSourceRecipe = recipe;
