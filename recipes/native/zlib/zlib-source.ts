//! zlib source download.
import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://zlib.net/fossils/zlib-1.3.1.tar.gz",
  hash: "207c3b0862cb4e3686f8405f76a98c38dbad9c94bcf4be4b9efca0716aba51ec",
});

await importToStore(recipe);
export const zlibSourceRecipe = recipe;
