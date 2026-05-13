//! xcb-proto source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.x.org/releases/individual/proto/xcb-proto-1.17.0.tar.xz",
  hash: "68187400fded667f60b4b020d0fc37fa489ae0de33169fe7b07fcbaf88e7a3f9",
});

await importToStore(recipe);
export const xcbProtoSourceRecipe = recipe;
