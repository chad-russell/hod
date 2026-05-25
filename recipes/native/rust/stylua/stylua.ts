//! StyLua native build recipe — opinionated Lua code formatter.
//!
//! Builds StyLua 2.3.1 from source using the prebuilt Rust toolchain. This is
//! intentionally the first small dev-tooling package for the ThinkPad dev
//! profile before larger language-server stacks.

import { dep, importToStore } from "../../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust.js";
import { caCertificatesRecipe } from "../../ca-certificates/ca-certificates.js";
import { zlibRecipe } from "../../zlib/zlib.js";
import { cargoBuild } from "../../../helpers/rust.js";
import { styluaSourceRecipe } from "./stylua-source.js";

const recipe = await cargoBuild({
  name: "stylua",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  source: "source",
  deps: [
    dep("source", styluaSourceRecipe),
    dep("ca-certs", caCertificatesRecipe),
    dep("zlib", zlibRecipe),
  ],
  env: {
    CARGO_HTTP_CAINFO: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",
    SSL_CERT_FILE: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",
  },
  unsafe_flags: 0x01,
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const styluaRecipe = recipe;
