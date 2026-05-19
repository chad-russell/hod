//! cosmic-files source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-files.git",
  revision: "f9b215dbd4e317deee0d3383e075e796459286d6",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "b48b880336612e8e8b9a65209092ec8ddd31d810530c050ea86f5c3960fe5acb",
});

export const CosmicFilesSourceRecipe = recipe;
