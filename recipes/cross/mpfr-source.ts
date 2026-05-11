//! mpfr source download.
import { download, importToStore } from "../../js/src/index.js";
const recipe = await download({
  url: "https://mirrors.kernel.org/gnu/mpfr/mpfr-4.2.0.tar.xz",
  hash: "4e95c8d9eda9a18d01dd3ac5879437c51aa0357b6feb997aa4aeb30762a903e1",
});

await importToStore(recipe);
export const mpfrSourceRecipe = recipe;
