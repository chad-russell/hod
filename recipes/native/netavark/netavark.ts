//! netavark native build recipe — container network backend for podman.
//!
//! Builds netavark 1.17.2 from source using the Rust toolchain. Netavark
//! handles container network setup (bridge networks, DNS, port mapping).
//!
//! Dependencies: toolchain (C compiler + glibc), rust (Rust toolchain).

import {
  dep,
  importToStore,
} from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust/rust.js";
import { caCertificatesRecipe } from "../ca-certificates/ca-certificates.js";
import { protocRecipe } from "../protobuf/protobuf.js";
import { netavarkSourceRecipe } from "./netavark-source.js";
import { cargoBuild } from "../../helpers/rust.js";
import { caCertEnv } from "../../helpers/build-env.js";

const recipe = await cargoBuild({
  name: "netavark",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  source: "source",
  deps: [
    dep("source", netavarkSourceRecipe),
    dep("ca-certs", caCertificatesRecipe),
    dep("protoc", protocRecipe),
  ],
  env: {
    ...caCertEnv(),
    PROTOC: "/deps/protoc/bin/protoc",
  },
  unsafe_flags: 0x01,
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const netavarkRecipe = recipe;
