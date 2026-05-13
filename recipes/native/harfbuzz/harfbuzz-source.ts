//! harfbuzz source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/harfbuzz/harfbuzz/releases/download/10.2.0/harfbuzz-10.2.0.tar.xz",
  hash: "fdc28de7b3f9ac2a91854bcfc5fec60daed96377b4921e4985f7e831ffeb0a0e",
});

await importToStore(recipe);
export const harfbuzzSourceRecipe = recipe;
