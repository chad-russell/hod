//! Markdown Oxide native build recipe — Markdown language server.

import { dep, importToStore } from "../../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust.js";
import { caCertificatesRecipe } from "../../ca-certificates/ca-certificates.js";
import { zlibRecipe } from "../../zlib/zlib.js";
import { cargoBuild } from "../../../helpers/rust.js";
import { caCertEnv } from "../../../helpers/net.js";
import { markdownOxideSourceRecipe } from "./markdown-oxide-source.js";

const recipe = await cargoBuild({
  name: "markdown-oxide",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  source: "source",
  deps: [
    dep("source", markdownOxideSourceRecipe),
    dep("ca-certs", caCertificatesRecipe),
    dep("zlib", zlibRecipe),
  ],
  env: caCertEnv(),
  unsafe_flags: 0x01,
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const markdownOxideRecipe = recipe;
