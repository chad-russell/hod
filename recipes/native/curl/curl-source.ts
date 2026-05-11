//! curl source download.
import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://curl.se/download/curl-8.20.0.tar.gz",
  hash: "8862445dddc7ac0f9185e601a2d2735874dfb953f96ea70af8d563784c5aad2f",
});

export const curlSourceRecipe = recipe;
