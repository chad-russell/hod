//! Prettierd packaged from npm using Bun.

import { bunPackage } from "../../helpers/bun-package.js";

const recipe = await bunPackage({
  packageName: "@fsouza/prettierd",
  version: "0.26.2",
  bins: [{ name: "prettierd", target: "src/index.js" }],
});

export const prettierdRecipe = recipe;
