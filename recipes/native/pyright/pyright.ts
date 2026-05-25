//! Pyright packaged from npm using Bun.

import { bunPackage } from "../../helpers/bun-package.js";

const recipe = await bunPackage({
  packageName: "pyright",
  version: "1.1.407",
  bins: [
    { name: "pyright", target: "index.js" },
    { name: "pyright-langserver", target: "langserver.index.js" },
  ],
});

export const pyrightRecipe = recipe;
