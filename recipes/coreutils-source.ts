//! coreutils source download.
import { fetchTarball } from "../../js/src/index.js";
const recipe = await fetchTarball({
  url: "https://mirrors.kernel.org/gnu/coreutils/coreutils-9.5.tar.gz",
  hash: "04b361e2793fd1c1eddf38535a700a89e9f84183b1b97fe6c927cd9f81aec028",
});

export const coreutilsSourceRecipe = recipe;
