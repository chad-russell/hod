//! yq — portable command-line YAML/JSON/XML/TOML processor.
//!
//! Builds mikefarah/yq v4.45.1 from source using the Go toolchain.
//! Pure Go (CGO_ENABLED=0) — produces a fully static binary.
//!
//! Networking is required during build for `go mod download` since
//! yq does not ship a vendor directory.
//!
//! GOTOOLCHAIN=local prevents Go from auto-downloading a newer toolchain
//! version (the go.mod may request a newer Go than what we have).

import { dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { goRecipe } from "../go/go.js";
import { goBuild } from "../../helpers/go.js";
import { yqSourceRecipe } from "./yq-source.js";
import { caCertificatesRecipe } from "../ca-certificates/ca-certificates.js";

const recipe = await goBuild({
  name: "yq",
  toolchain: nativeToolchainRecipe,
  goToolchain: goRecipe,
  source: "source",
  deps: [
    dep("source", yqSourceRecipe),
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
    "-X", "main.GitDescribe=v4.45.1",
  ],
  unsafe_flags: 0x01, // networking needed for go mod download
});

await importToStore(recipe);
export const yqRecipe = recipe;
