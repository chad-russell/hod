//! rust-analyzer native build recipe — Rust language server.

import { dep, importToStore } from "../../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust.js";
import { caCertificatesRecipe } from "../../ca-certificates/ca-certificates.js";
import { zlibRecipe } from "../../zlib/zlib.js";
import { cargoBuild } from "../../../helpers/rust.js";
import { caCertEnv } from "../../../helpers/net.js";
import { rustAnalyzerSourceRecipe } from "./rust-analyzer-source.js";

const recipe = await cargoBuild({
  name: "rust-analyzer",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  source: "source",
  deps: [
    dep("source", rustAnalyzerSourceRecipe),
    dep("ca-certs", caCertificatesRecipe),
    dep("zlib", zlibRecipe),
  ],
  env: caCertEnv(),
  unsafe_flags: 0x01,
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const rustAnalyzerRecipe = recipe;
