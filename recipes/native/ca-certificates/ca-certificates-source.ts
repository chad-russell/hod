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
  hash: "d4fa062695f9036fdea31af9b4305b9d2e6cb941b80e89c49d5e6780bd0bed01",
});
await importToStore(dl);

const recipe = dl;

export const caCertificatesSourceRecipe = recipe;
