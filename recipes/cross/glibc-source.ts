//! glibc source download.
import { download, importToStore } from "../../js/src/index.js";
const recipe = await download({
  url: "https://mirrors.kernel.org/gnu/glibc/glibc-2.41.tar.xz",
  hash: "8f0057ecc7fb00714079015f25ef0b6c42c3580f68b48c52c2631ee8061e50b6",
});

await importToStore(recipe);
export const glibcSourceRecipe = recipe;
