//! musl libc source download.
//!
//! Downloads musl 1.2.5 from musl.libc.org.
//! This is the source tarball used to build a from-source musl libc
//! in musl-build.ts, replacing the opaque musl.cc pre-built toolchain.
import { download, importToStore } from "../../js/src/index.js";

const recipe = await download({
  url: "https://musl.libc.org/releases/musl-1.2.5.tar.gz",
  hash: "63f96e526d3a73fddff8fcb9ee5c1dcbfdac8405db7d7537c3d1c8fffd5e6947",
});

await importToStore(recipe);
export const muslSourceRecipe = recipe;
