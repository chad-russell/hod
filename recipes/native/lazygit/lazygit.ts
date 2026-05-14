//! lazygit native build recipe — simple terminal UI for git commands.
//!
//! Builds jesseduffield/lazygit v0.55.1 from source using the Go toolchain.
//! Pure Go (CGO_ENABLED=0) — produces a fully static binary.
//!
//! The source tarball includes a vendor directory, so no network access
//! is required during the build.
//!
//! GOTOOLCHAIN=local prevents Go from auto-downloading a newer toolchain
//! version.

import { dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { goRecipe } from "../go/go.js";
import { goBuild } from "../../helpers/go.js";
import { lazygitSourceRecipe } from "./lazygit-source.js";

const recipe = await goBuild({
  name: "lazygit",
  toolchain: nativeToolchainRecipe,
  goToolchain: goRecipe,
  source: "source",
  deps: [
    dep("source", lazygitSourceRecipe),
  ],
  env: {
    // Prevent Go from auto-downloading a newer toolchain.
    GOTOOLCHAIN: "local",
  },
  buildFlags: ["-mod=vendor"],
  ldflags: [
    "-s",
    "-w",
    "-X", "main.version=0.55.1",
    "-X", "main.commit=3de12b7",
    "-X", "main.date=2025-09-17",
    "-X", "main.buildSource=binary",
  ],
  // No unsafe_flags needed — vendor directory is included in the tarball.
});

await importToStore(recipe);
export const lazygitRecipe = recipe;
