//! ThinkPad dev profile — developer runtimes and tools.
//!
//! Keep this separate from the daily CLI profile so larger runtimes can be
//! deployed, pinned, and rolled back independently.

import { distroboxRecipe } from "../recipes/native/distrobox/distrobox.js";
import { bunRecipe } from "../recipes/native/bun/bun.js";
import { nodejsRecipe } from "../recipes/native/nodejs/nodejs.js";
import { markdownOxideRecipe } from "../recipes/native/rust/markdown-oxide/markdown-oxide.js";
import { ruffRecipe } from "../recipes/native/rust/ruff/ruff.js";
import { rustAnalyzerRecipe } from "../recipes/native/rust/rust-analyzer/rust-analyzer.js";
import { styluaRecipe } from "../recipes/native/rust/stylua/stylua.js";

export const profile = {
  name: "thinkpad-dev",
  packages: [
    { name: "bun", recipe: bunRecipe },
    { name: "distrobox", recipe: distroboxRecipe },
    { name: "markdown-oxide", recipe: markdownOxideRecipe },
    { name: "nodejs", recipe: nodejsRecipe },
    { name: "ruff", recipe: ruffRecipe },
    { name: "rust-analyzer", recipe: rustAnalyzerRecipe },
    { name: "stylua", recipe: styluaRecipe },
  ],
};
