//! ncurses source download.
import { download, importToStore } from "../../../js/src/index.js";
const recipe = await download({
  url: "https://invisible-island.net/archives/ncurses/ncurses-6.6.tar.gz",
  hash: "fbec55697a01f99b9cc3f25be55e73ae7091f4c53e5d81a1ea15734c4e5b7238",
});

await importToStore(recipe);
export const ncursesSourceRecipe = recipe;
