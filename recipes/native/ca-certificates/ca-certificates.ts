//! ca-certificates native build recipe — Mozilla CA certificate bundle.
//!
//! Data-only package: downloads the Mozilla CA certificate bundle (PEM format)
//! and installs it at the standard paths used by curl, git, openssl, and other
//! TLS tools.
//!
//! Output layout:
//!   /etc/ssl/certs/ca-certificates.crt   (Debian/Ubuntu convention)
//!   /etc/ssl/cert.pem                     (OpenBSD/Alpine convention)
//!   /ssl/certs/ca-bundle.crt              (Red Hat convention)
//!
//! To use: set SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt (or any of the
//! above paths) in the environment of any recipe that needs HTTPS verification.
//!
//! Dependencies: toolchain only (for busybox shell).

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { caCertificatesSourceRecipe } from "./ca-certificates-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `
# Install the CA certificate bundle at standard paths
mkdir -p $OUT/etc/ssl/certs
mkdir -p $OUT/ssl/certs

# Primary: Debian/Ubuntu standard path
cp /deps/source/source $OUT/etc/ssl/certs/ca-certificates.crt

# Symlinks for other conventions (all relative for store compatibility)
# OpenBSD/Alpine style
ln -s ../certs/ca-certificates.crt $OUT/etc/ssl/cert.pem
# Red Hat style
ln -s ../../etc/ssl/certs/ca-certificates.crt $OUT/ssl/certs/ca-bundle.crt
`,
  deps: [
    dep("source", caCertificatesSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
});

await importToStore(recipe);
export const caCertificatesRecipe = recipe;
