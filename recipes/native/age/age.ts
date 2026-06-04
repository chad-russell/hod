//! age — simple, modern, secure file encryption.
//!
//! Builds FiloSottile/age v1.3.1 from source using the Go toolchain.
//! Pure Go (CGO_ENABLED=0) — produces fully static binaries.
//!
//! Produces two binaries:
//!   - bin/age         — encrypt/decrypt files
//!   - bin/age-keygen  — generate age key pairs
//!
//! Uses shellBuild + goProfile because age produces multiple binaries
//! from subdirectories of ./cmd/, which doesn't fit the single-binary
//! goBuild convenience wrapper.
//!
//! Networking is required during build for `go mod download` since
//! age does not ship a vendor directory.
//!
//! GOTOOLCHAIN=local prevents Go from auto-downloading Go 1.25.5
//! (the go.mod toolchain directive). Our Go 1.24.3 satisfies the
//! `go 1.24.0` minimum requirement.
//!
//! The version is injected via -ldflags into the `Version` variable
//! in each main package, matching the upstream release process.

import {
  dep,
  importToStore,
  shellBuild,
} from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { goRecipe } from "../go/go.js";
import { goProfile } from "../../helpers/go.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";
import { ageSourceRecipe } from "./age-source.js";
import { caCertificatesRecipe } from "../ca-certificates/ca-certificates.js";

const profile = goProfile();

const recipe = await shellBuild({
  ...profile,
  deps: [
    dep("toolchain", nativeToolchainRecipe),
    dep("go", goRecipe),
    dep("source", ageSourceRecipe),
    dep("cacert", caCertificatesRecipe),
  ],
  env: {
    ...profile.env,
    // Prevent Go from auto-downloading a newer toolchain.
    // go.mod specifies toolchain go1.25.5, but we have 1.24.3 which
    // satisfies the minimum `go 1.24.0` requirement.
    GOTOOLCHAIN: "local",
    // CA certificates for HTTPS module downloads.
    SSL_CERT_FILE: "/deps/cacert/etc/ssl/certs/ca-certificates.crt",
  },
  sourceDir: true,
  script: `
# Build age (encryption/decryption tool)
go build -trimpath \
  -ldflags '-s -w -X main.Version=v1.3.1' \
  -o $OUT/bin/age ./cmd/age

# Build age-keygen (key pair generator)
go build -trimpath \
  -ldflags '-s -w -X main.Version=v1.3.1' \
  -o $OUT/bin/age-keygen ./cmd/age-keygen

${STRIP_BINARIES}
`,
  unsafe_flags: 0x01, // networking needed for go mod download
});

await importToStore(recipe);
export const ageRecipe = recipe;
