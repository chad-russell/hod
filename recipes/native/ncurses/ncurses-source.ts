//! ncurses source download.
import { fetchTarball } from "../../../js/src/index.js";
const recipe = await fetchTarball({
  url: "https://invisible-island.net/archives/ncurses/ncurses-6.6.tar.gz",
  hash: "fbec55697a01f99b9cc3f25be55e73ae7091f4c53e5d81a1ea15734c4e5b7238",
});

export const ncursesSourceRecipe = recipe;
