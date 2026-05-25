//! libclc source from the LLVM 22.1.5 monorepo.
//!
//! LLVM does not publish a standalone libclc source tarball for 22.1.5, so we
//! fetch the matching llvm-project release tarball and build the libclc
//! subdirectory from there.

import { fetchTarball } from "../../../js/src/index.js";

export const libclcSourceRecipe = await fetchTarball({
  url: "https://github.com/llvm/llvm-project/releases/download/llvmorg-22.1.5/llvm-project-22.1.5.src.tar.xz",
  hash: "3969d4e3dd768c05fb73e8e17c36fe6a89002379f5064ba0c200b5242b8c5e86",
});
