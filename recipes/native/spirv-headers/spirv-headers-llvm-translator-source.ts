//! SPIRV-Headers source pinned by SPIRV-LLVM-Translator 22.1.0.

import { fetchTarball } from "../../../js/src/index.js";

export const spirvHeadersLlvmTranslatorSourceRecipe = await fetchTarball({
  url: "https://github.com/KhronosGroup/SPIRV-Headers/archive/9268f3057354a2cb65991ba5f38b16d81e803692.tar.gz",
  hash: "13139ea50266ff3885d53815e12d6f2ae0cda42a7889f4328690b9ea4734b252",
});
