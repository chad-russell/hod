//! Node.js source download.
import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://nodejs.org/dist/v22.22.3/node-v22.22.3.tar.xz",
  hash: "2697f42f228f2e76b7e02fb87ef740117e32795276687e11fb4a86de8dff8234",
});

export const nodejsSourceRecipe = recipe;
