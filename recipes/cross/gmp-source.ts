//! gmp source download.
import { download, importToStore } from "../../js/src/index.js";
const recipe = await download({
  url: "https://mirrors.kernel.org/gnu/gmp/gmp-6.3.0.tar.xz",
  hash: "fffe4996713928ae19331c8ef39129e46d3bf5b7182820656fd4639435cd83a4",
});

await importToStore(recipe);
export const gmpSourceRecipe = recipe;
