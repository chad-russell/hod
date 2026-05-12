//! fzf — general-purpose command-line fuzzy finder.
//!
//! Builds junegunn/fzf v0.72.0 from source using the Go toolchain.
//! Pure Go (CGO_ENABLED=0) — produces a fully static binary.
//!
//! Networking is required during build for `go mod download` since
//! fzf does not ship a vendor directory.
//!
//! GOTOOLCHAIN=local prevents Go from auto-downloading a newer toolchain
//! version (the go.mod requests Go 1.23 which is satisfied by our 1.24.3).

import { dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { goRecipe } from "../go/go.js";
import { goBuild } from "../../helpers/go.js";
import { fzfSourceRecipe } from "./fzf-source.js";
import { caCertificatesRecipe } from "../ca-certificates/ca-certificates.js";

const recipe = await goBuild({
  name: "fzf",
  toolchain: nativeToolchainRecipe,
  goToolchain: goRecipe,
  source: "source",
  deps: [
    dep("source", fzfSourceRecipe),
    dep("cacert", caCertificatesRecipe),
  ],
  env: {
    // Prevent Go from auto-downloading a newer toolchain.
    GOTOOLCHAIN: "local",
    // CA certificates for HTTPS module downloads.
    SSL_CERT_FILE: "/deps/cacert/etc/ssl/certs/ca-certificates.crt",
  },
  ldflags: [
    "-s",
    "-w",
    "-X", "main.version=0.72.0",
    "-X", "main.revision=6fefe025",
  ],
  unsafe_flags: 0x01, // networking needed for go mod download
});

await importToStore(recipe);
export const fzfRecipe = recipe;
