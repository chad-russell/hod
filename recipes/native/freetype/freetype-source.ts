//! freetype source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.savannah.gnu.org/releases/freetype/freetype-2.13.3.tar.xz",
  hash: "07a01894ccdb584943ce817b57341a8595ce9a92bfaa77c602ec4757dfabd5e2",
});

await importToStore(recipe);
export const freetypeSourceRecipe = recipe;
