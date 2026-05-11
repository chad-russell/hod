//! bzip2 source download.
import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://sourceware.org/pub/bzip2/bzip2-1.0.8.tar.gz",
  hash: "97af3f520629c65fe41292f77e6ca798fe594d7987bfb2aebe7c6fcdc7ab5ed2",
});

export const bzip2SourceRecipe = recipe;
