//! glib source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.gnome.org/sources/glib/2.82/glib-2.82.5.tar.xz",
  hash: "9f5b4a12c6f328b167e81f457319f199acbaa02a63107d698ee9953193740b5f",
});

await importToStore(recipe);
export const glibSourceRecipe = recipe;
