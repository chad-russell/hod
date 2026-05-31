//! Minimal VM dev profile — developer runtimes for the Hod OS VM.
//!
//! This profile adds developer tools on top of the CLI userland profile.
//! Deploy it as a second profile alongside minimal-vm, or extend the VM
//! deployment to include both.

import { bunRecipe } from "../recipes/native/bun/bun.js";
import { nodejsRecipe } from "../recipes/native/nodejs/nodejs.js";
import { pythonRecipe } from "../recipes/native/python/python.js";
import { ruffRecipe } from "../recipes/native/rust/ruff/ruff.js";
import { styluaRecipe } from "../recipes/native/rust/stylua/stylua.js";
import { rustAnalyzerRecipe } from "../recipes/native/rust/rust-analyzer/rust-analyzer.js";
import { markdownOxideRecipe } from "../recipes/native/rust/markdown-oxide/markdown-oxide.js";

export const profile = {
  name: "minimal-vm-dev",
  packages: [
    { name: "bun", recipe: bunRecipe },
    { name: "nodejs", recipe: nodejsRecipe },
    { name: "python3", recipe: pythonRecipe },
    { name: "ruff", recipe: ruffRecipe },
    { name: "rust-analyzer", recipe: rustAnalyzerRecipe },
    { name: "stylua", recipe: styluaRecipe },
    { name: "markdown-oxide", recipe: markdownOxideRecipe },
  ],
};
