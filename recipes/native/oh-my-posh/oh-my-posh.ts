//! oh-my-posh native build recipe — customisable cross-platform/shell prompt renderer.
//!
//! Builds JanDeDobbeleer/oh-my-posh v29.13.1 from source using the Go toolchain.
//! Pure Go (CGO_ENABLED=0) — produces a fully static binary.
//!
//! The source tarball does NOT include a vendor directory, so network access
//! is required during build to download Go modules.
//!
//! Source code lives in the `src/` subdirectory of the tarball — the project
//! root contains docs/themes/config, while `src/` holds the Go module.
//!
//! GOTOOLCHAIN=local prevents Go from auto-downloading a newer toolchain.

import { dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { goRecipe } from "../go/go.js";
import { goBuild } from "../../helpers/go.js";
import { caCertEnv } from "../../helpers/build-env.js";
import { caCertificatesRecipe } from "../ca-certificates/ca-certificates.js";
import { ohMyPoshSourceRecipe } from "./oh-my-posh-source.js";

const recipe = await goBuild({
  name: "oh-my-posh",
  toolchain: nativeToolchainRecipe,
  goToolchain: goRecipe,
  source: "source",
  sourceSubdir: "src",
  deps: [
    dep("source", ohMyPoshSourceRecipe),
    dep("cacerts", caCertificatesRecipe),
  ],
  env: {
    GOTOOLCHAIN: "local",
    ...caCertEnv("cacerts"),
  },
  ldflags: [
    "-s",
    "-w",
    "-X", "github.com/jandedobbeleer/oh-my-posh/src/build.Version=29.13.1",
  ],
  // Network access required — no vendor directory in source tarball.
  unsafe_flags: 1,
});

await importToStore(recipe);
export const ohMyPoshRecipe = recipe;
