//! TypeScript language server packaged from npm using Bun.

import { bunPackage } from "../../helpers/bun-package.js";

const recipe = await bunPackage({
  packageName: "typescript-language-server",
  version: "5.1.3",
  extraPackageRefs: ["typescript@5.9.3"],
  bins: [{ name: "typescript-language-server", target: "lib/cli.mjs" }],
});

export const typescriptLanguageServerRecipe = recipe;
