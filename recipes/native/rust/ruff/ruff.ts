//! Ruff native build recipe — Python linter and formatter.

import { dep, importToStore } from "../../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust.js";
import { caCertificatesRecipe } from "../../ca-certificates/ca-certificates.js";
import { zlibRecipe } from "../../zlib/zlib.js";
import { cargoBuild } from "../../../helpers/rust.js";
import { caCertEnv } from "../../../helpers/net.js";
import { ruffSourceRecipe } from "./ruff-source.js";

const recipe = await cargoBuild({
  name: "ruff",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  source: "source",
  deps: [
    dep("source", ruffSourceRecipe),
    dep("ca-certs", caCertificatesRecipe),
    dep("zlib", zlibRecipe),
  ],
  env: caCertEnv(),
  preBuildScript: `
# The default Linux build enables tikv-jemallocator, whose configure test
# binaries do not run under Hod's current sandbox. Use Rust's platform default
# allocator for now; this still resolves to Hod's glibc via runtime_deps.
sed -i '/tikv-jemallocator/d' crates/ruff/Cargo.toml
sed -i '15,28d' crates/ruff/src/main.rs
`,
  cargoFlags: ["-p", "ruff"],
  unsafe_flags: 0x01,
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const ruffRecipe = recipe;
