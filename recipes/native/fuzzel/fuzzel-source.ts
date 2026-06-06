import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://codeberg.org/dnkl/fuzzel/archive/1.14.1.tar.gz",
  hash: "e9814ab690e1904bc126575b4f23e22d3dffdef6ba0ecbd0ff7b66b40fc8baaa",
});

export const fuzzelSourceRecipe = recipe;
