//! grep source download.
import { fetchTarball } from "../../js/src/index.js";
const recipe = await fetchTarball({
  url: "https://mirrors.kernel.org/gnu/grep/grep-3.11.tar.gz",
  hash: "3f89442f3f593ad02e5a392d56d531196d43154dba716a001010b458c6f428e6",
});

export const grepSourceRecipe = recipe;
