//! Mozilla CA certificate bundle source download.
//!
//! Downloads the cacert.pem bundle from curl.se, which is a PEM-formatted
//! conversion of Mozilla's CA certificate store. This is the standard CA
//! bundle used by curl, git, and many other tools for HTTPS verification.
//!
//! Updated periodically by Mozilla. See https://curl.se/docs/caextract.html
//! for the latest version and changelog.

import { download, importToStore } from "../../../js/src/index.js";

const dl = await download({
  url: "https://curl.se/ca/cacert.pem",
  hash: "2b49b17ae05fa7bf9120268dbdb9f10228bb220e792406fc5f664b7a3009d933",
});
await importToStore(dl);

const recipe = dl;

export const caCertificatesSourceRecipe = recipe;
