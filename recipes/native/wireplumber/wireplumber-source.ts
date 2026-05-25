//! WirePlumber source download.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/PipeWire/wireplumber/archive/refs/tags/0.5.14.tar.gz",
  hash: "77df1475f66d44c70cef6ded03584586a3413b982c9e9af62622449391324edf",
});

export const wireplumberSourceRecipe = recipe;
