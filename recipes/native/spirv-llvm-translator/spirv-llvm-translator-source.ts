//! SPIRV-LLVM-Translator source download.

import { fetchTarball } from "../../../js/src/index.js";

export const spirvLlvmTranslatorSourceRecipe = await fetchTarball({
  url: "https://github.com/KhronosGroup/SPIRV-LLVM-Translator/archive/refs/tags/v22.1.0.tar.gz",
  hash: "87bec0c9d62a7c971a0e2d25ebcdf3f69ca4558f8b297de8d596e242ad38cd9d",
});
