import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/emersion/mako/archive/refs/tags/v1.11.0.tar.gz",
  hash: "80b948a25f2d6cc9fbe12da7705c6f27cda5947283e8e7e25327943b3a3b59c7",
});

export const makoNotifySourceRecipe = recipe;
