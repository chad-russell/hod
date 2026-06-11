import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://release.files.ghostty.org/1.3.1/ghostty-1.3.1.tar.gz",
  hash: "bbc0fd9e9f984939f1c112e0896b79acc6366d9fb4ce4b6321999b2754b6f4c3",
});

export const ghosttySourceRecipe = recipe;
