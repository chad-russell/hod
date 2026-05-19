//! xdg-desktop-portal-cosmic source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/xdg-desktop-portal-cosmic.git",
  revision: "308da48a279006f28dcf9a42b0f14499d40e2e4f",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "1e01a738a85cd4e7640be362a02cbb705ac8bf98053c3765199c6266ee6ffd98",
});

export const XdgDesktopPortalCosmicSourceRecipe = recipe;
