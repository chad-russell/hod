//! openssh source download.
//!
//! OpenSSH 10.3p1 — premier connectivity tool for remote login with the SSH protocol.

import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://ftp.openbsd.org/pub/OpenBSD/OpenSSH/portable/openssh-10.3p1.tar.gz",
  hash: "2193afffd02f8fefcb936270de7111b997e2cec9b29487085c61c145291abba9",
});

await importToStore(recipe);
export const opensshSourceRecipe = recipe;
