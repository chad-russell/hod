//! flex source download.
//!
//! Flex 2.6.4 — fast lexical analyzer generator (LEX replacement).

import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://github.com/westes/flex/releases/download/v2.6.4/flex-2.6.4.tar.gz",
  hash: "d78b714ac38bd9de7f9b44a078efed82e96ed43e7cf9cd33944a7f379a2d09a4",
});

await importToStore(recipe);
export const flexSourceRecipe = recipe;
