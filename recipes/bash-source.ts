//! bash source download.
import { fetchTarball } from "../../js/src/index.js";
const recipe = await fetchTarball({
  url: "https://mirrors.kernel.org/gnu/bash/bash-5.2.37.tar.gz",
  hash: "78d49588b74add7bb37317fb7aee7a5979e2cab4b34b1fd40306fb464bb46bdc",
});

export const bashSourceRecipe = recipe;
