//! pkgconf source download.
import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://distfiles.ariadne.space/pkgconf/pkgconf-2.5.1.tar.xz",
  hash: "c524d73c938e7382d3c12c9cfba16ed32ee092ab21b3e9659a095b5628ea2e88",
});

await importToStore(recipe);
export const pkgconfSourceRecipe = recipe;
