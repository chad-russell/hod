//! libXfixes source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.x.org/releases/individual/lib/libXfixes-6.0.1.tar.xz",
  hash: "ccbae58717aa81f1ef52a2e6cbb7c57553a98b93f5a7a6f8a78e793a3a0c7f78",
});

await importToStore(recipe);
export const libXfixesSourceRecipe = recipe;
