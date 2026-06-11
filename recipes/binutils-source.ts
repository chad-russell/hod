//! binutils source download.
import { fetchTarball } from "../../js/src/index.js";
const recipe = await fetchTarball({
  url: "https://mirrors.kernel.org/gnu/binutils/binutils-2.42.tar.gz",
  hash: "e0475ee24a256c7e26324efb3e83c6f471c686e561f46115e41d4215bf74f2df",
});

export const binutilsSourceRecipe = recipe;
