//! Alacritty source — fetch from git at v0.17.0 release.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/alacritty/alacritty.git",
  revision: "dc946285396bd3e251b6942af7e9961b74f76bee",
  hash: "3a0edf5afc2e8223d8ea2e397cc8ceaf136348fb2b07fa6d80a58bc8d78bb322",
});

export const alacrittySourceRecipe = recipe;
