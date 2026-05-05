//! linux-headers source download.
import { download, importToStore } from "../../js/src/index.js";
const recipe = await download({
  url: "https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-6.6.85.tar.xz",
  hash: "51aa7b2d70e35877bd28dc7970b047569cf42cf19cc0282c51dd220be0fe14a9",
});

await importToStore(recipe);
export const linuxHeadersSourceRecipe = recipe;
