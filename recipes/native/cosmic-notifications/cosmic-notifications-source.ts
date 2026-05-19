//! cosmic-notifications source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-notifications.git",
  revision: "a899bfbc6715c36b1f02d7a0f4d3601a3ea0295f",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "157abe965ec2252cdff91d57413df0e93610d3c76e32a38d833e8f02acb41fe5",
});

export const CosmicNotificationsSourceRecipe = recipe;
