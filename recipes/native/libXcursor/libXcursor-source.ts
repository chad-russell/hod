//! libXcursor source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.x.org/releases/individual/lib/libXcursor-1.2.2.tar.xz",
  hash: "9d5f790fe40acdd40ea6b478772fbee8e9496235da585b4a11f7abe055400ea1",
});

await importToStore(recipe);
export const libXcursorSourceRecipe = recipe;
