//! aardvark-dns native build recipe — DNS resolver for container networks.
//!
//! Builds aardvark-dns 1.17.1 from source using the Rust toolchain.
//! Provides DNS resolution for podman container networks (companion
//! to netavark).
//!
//! Dependencies: toolchain (C compiler + glibc), rust (Rust toolchain).

import {
  dep,
  importToStore,
} from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust/rust.js";
import { caCertificatesRecipe } from "../ca-certificates/ca-certificates.js";
import { aardvarkDnsSourceRecipe } from "./aardvark-dns-source.js";
import { cargoBuild } from "../../helpers/rust.js";
import { caCertEnv } from "../../helpers/build-env.js";

const recipe = await cargoBuild({
  name: "aardvark-dns",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  source: "source",
  deps: [
    dep("source", aardvarkDnsSourceRecipe),
    dep("ca-certs", caCertificatesRecipe),
  ],
  env: caCertEnv(),
  unsafe_flags: 0x01,
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const aardvarkDnsRecipe = recipe;
