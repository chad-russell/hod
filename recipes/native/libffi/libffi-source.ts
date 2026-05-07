//! libffi source download.
import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://github.com/libffi/libffi/releases/download/v3.4.8/libffi-3.4.8.tar.gz",
  hash: "de1dd7b28179fa499f9d6059f1e9e12a0fe3cb9ff13f4561bb3fc02bc072d5ec",
});

await importToStore(recipe);
export const libffiSourceRecipe = recipe;
