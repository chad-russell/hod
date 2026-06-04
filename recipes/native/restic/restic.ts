//! restic — fast, secure, efficient backup program.
//!
//! Builds restic/restic v0.18.1 from source using the Go toolchain.
//! Pure Go (CGO_ENABLED=0) — produces a fully static binary.
//!
//! restic's main package is at ./cmd/restic (not the repo root), and it
//! requires build tags "selfupdate disable_grpc_modules", so we use
//! shellBuild + goProfile instead of the goBuild convenience wrapper.
//!
//! Networking is required during build for `go mod download` since
//! restic does not ship a vendor directory.
//!
//! GOTOOLCHAIN=local prevents Go from auto-downloading a newer toolchain
//! version (the go.mod requests Go 1.23 which is satisfied by our 1.24.3).

import {
  dep,
  importToStore,
  shellBuild,
} from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { goRecipe } from "../go/go.js";
import { goProfile } from "../../helpers/go.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";
import { caCertEnv } from "../../helpers/build-env.js";
import { resticSourceRecipe } from "./restic-source.js";
import { caCertificatesRecipe } from "../ca-certificates/ca-certificates.js";

const profile = goProfile();

const recipe = await shellBuild({
  ...profile,
  deps: [
    dep("toolchain", nativeToolchainRecipe),
    dep("go", goRecipe),
    dep("source", resticSourceRecipe),
    dep("cacert", caCertificatesRecipe),
  ],
  env: {
    ...profile.env,
    GOTOOLCHAIN: "local",
    ...caCertEnv("cacert"),
  },
  sourceDir: true,
  script: `
# Copy source to a writable build directory

# Build restic from ./cmd/restic with the same tags and ldflags as upstream.
# Tags: selfupdate (enable self-update command), disable_grpc_modules (reduce binary size).
go build -trimpath \
  -tags "selfupdate disable_grpc_modules" \
  -ldflags '-s -w -X main.version=0.18.1' \
  -o $OUT/bin/restic ./cmd/restic

${STRIP_BINARIES}
`,
  unsafe_flags: 0x01, // networking needed for go mod download
});

await importToStore(recipe);
export const resticRecipe = recipe;
