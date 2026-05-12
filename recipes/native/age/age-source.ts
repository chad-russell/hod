//! age source download.
//!
//! FiloSottile/age v1.3.1 — a simple, modern, and secure file encryption
//! tool, a GPG replacement designed for the 2020s.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/FiloSottile/age/archive/refs/tags/v1.3.1.tar.gz",
  hash: "10356fb1e444c05fd19d31c4544606359eac417c77a21210955a0d13cedc869a",
});

export const ageSourceRecipe = recipe;
