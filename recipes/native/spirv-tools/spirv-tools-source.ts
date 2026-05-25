//! SPIRV-Tools source download.

import { fetchTarball } from "../../../js/src/index.js";

export const spirvToolsSourceRecipe = await fetchTarball({
  url: "https://github.com/KhronosGroup/SPIRV-Tools/archive/refs/tags/vulkan-sdk-1.4.321.0.tar.gz",
  hash: "2fc080cabfdc02eb09f7f8eeafcb50e21df60756a1415dc482f8e6118067b37a",
});
