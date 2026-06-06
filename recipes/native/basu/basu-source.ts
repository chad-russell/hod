import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://git.sr.ht/~emersion/basu/archive/v0.2.1.tar.gz",
  hash: "8e678e54208e0690d22d522448293da66cea08a4aeccb645b66b765f93ae2e66",
});

export const basuSourceRecipe = recipe;
