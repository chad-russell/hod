//! libpthread-stubs source download.
import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.x.org/releases/individual/lib/libpthread-stubs-0.5.tar.xz",
  hash: "e282d49eda2bbbc76345e68a9413a132b734033562d9ef56c4140912fa906a12",
});

await importToStore(recipe);
export const libpthreadStubsSourceRecipe = recipe;
