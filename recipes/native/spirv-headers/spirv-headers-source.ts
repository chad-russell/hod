//! SPIRV-Headers source download.

import { fetchTarball } from "../../../js/src/index.js";

export const spirvHeadersSourceRecipe = await fetchTarball({
  url: "https://github.com/KhronosGroup/SPIRV-Headers/archive/refs/tags/vulkan-sdk-1.4.321.0.tar.gz",
  hash: "3e4bf541c6e857b7aee0e7e56ecadcc0085f9599d821f3504508ea2cd18728ba",
});
