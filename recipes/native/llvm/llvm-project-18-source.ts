//! LLVM/Clang 18 monorepo source download.
//!
//! Fixed-output fetch of the upstream LLVM 18.1.8 monorepo source archive.
//! This is the source input for the source-built minimal bindgen-clang pivot.

import { fetchTarball } from "../../../js/src/index.js";

export const llvmProject18SourceRecipe = await fetchTarball({
  url: "https://github.com/llvm/llvm-project/releases/download/llvmorg-18.1.8/llvm-project-18.1.8.src.tar.xz",
  hash: "450adbb7590dda12a622cb3d74a51cb101ac7eb58177b9e25b93b2abdfc5dcdc",
});
