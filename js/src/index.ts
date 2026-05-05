//! Hod SDK — TypeScript library for building hod recipes.
//!
//! Usage:
//!   import { process, fileFromPath, dep, writeHod, writeJson, fromHod, fromJson } from "hod-sdk";

// Types
export type { BuiltRecipe, FileFromPathOptions } from "./file.js";
export type { ProcessDependency } from "./dep.js";
export type { ProcessDefinition, EnvEntry } from "./process.js";
export type { DownloadOptions } from "./download.js";

// Recipe constructors
export { fileFromPath } from "./file.js";
export { dep } from "./dep.js";
export { process } from "./process.js";
export { download } from "./download.js";

// Output helpers
export { writeHod, writeJson } from "./output.js";

// Import helpers
export { fromHod, fromJson } from "./import.js";
