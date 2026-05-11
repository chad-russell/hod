//! openssh source download.
//!
//! OpenSSH 10.3p1 — premier connectivity tool for remote login with the SSH protocol.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://ftp.openbsd.org/pub/OpenBSD/OpenSSH/portable/openssh-10.3p1.tar.gz",
  hash: "2193afffd02f8fefcb936270de7111b997e2cec9b29487085c61c145291abba9",
});

export const opensshSourceRecipe = recipe;
