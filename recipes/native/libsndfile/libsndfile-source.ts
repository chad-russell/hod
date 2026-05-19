import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/libsndfile/libsndfile/releases/download/1.0.31/libsndfile-1.0.31.tar.bz2",
  hash: "c7ad16c89467779f65aac8a9bebf5e34d76dc141dbedc40100652daf62e967fa",
});

export const libsndfileSourceRecipe = recipe;
