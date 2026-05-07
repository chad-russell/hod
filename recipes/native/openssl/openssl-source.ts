//! openssl source download.
import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://github.com/openssl/openssl/releases/download/openssl-3.5.0/openssl-3.5.0.tar.gz",
  hash: "c30a6b10be0dc613779f111398559cbbbd34dd67b7cbff101eadc2d4431dda82",
});

await importToStore(recipe);
export const opensslSourceRecipe = recipe;
