//! github-cli native build recipe — GitHub's official command line tool.
//!
//! Builds cli/cli v2.92.0 from source using the Go toolchain.
//! Pure Go (CGO_ENABLED=0) — produces a static binary.
//!
//! The source tarball does NOT include a vendor directory, so network access
//! is required during build to download Go modules.
//!
//! The main Go package is at ./cmd/gh (not at the repo root), so we use
//! shellBuild + goProfile directly instead of the goBuild helper.
//!
//! GOTOOLCHAIN=local prevents Go from auto-downloading a newer toolchain.

import { dep, depSubpath, importToStore, shellBuild } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { goRecipe } from "../go/go.js";
import { goProfile } from "../../helpers/go.js";
import { caCertificatesRecipe } from "../ca-certificates/ca-certificates.js";
import { githubCliSourceRecipe } from "./github-cli-source.js";

const profile = goProfile();

const recipe = await shellBuild({
  ...profile,
  env: {
    ...profile.env,
    GOTOOLCHAIN: "local",
    SSL_CERT_FILE: `${depSubpath("cacerts", "etc/ssl/certs/ca-certificates.crt")}`,
  },
  script: `
cp -a /deps/source/. /tmp/build
cd /tmp/build

go build -trimpath \
  -ldflags '-s -w -X github.com/cli/cli/v2/internal/build.Version=2.92.0 -X github.com/cli/cli/v2/internal/build.Date=2026-04-28' \
  -o $OUT/bin/gh \
  ./cmd/gh

/deps/toolchain/bin/strip $OUT/bin/gh 2>/dev/null || true
`,
  deps: [
    dep("source", githubCliSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("go", goRecipe),
    dep("cacerts", caCertificatesRecipe),
  ],
  // Network access required — no vendor directory in source tarball.
  unsafe_flags: 1,
});

await importToStore(recipe);
export const githubCliRecipe = recipe;
