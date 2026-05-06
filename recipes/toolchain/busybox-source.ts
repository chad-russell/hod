//! busybox source download.
import { download, importToStore } from "../../js/src/index.js";

const recipe = await download({
  url: "https://busybox.net/downloads/busybox-1.37.0.tar.bz2",
  hash: "179c4567a112635be6cb442fd8e3ff95dd0e718facd0666f2426d94322110a8f",
});

await importToStore(recipe);
export const busyboxSourceRecipe = recipe;
