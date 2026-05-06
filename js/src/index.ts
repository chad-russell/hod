//! Hod SDK — TypeScript library for building hod recipes.
//!
//! Usage:
//!   import { process, fileFromPath, dep, importToStore, fromHod } from "hod-sdk";

// Types
export type { BuiltRecipe, FileFromPathOptions, FileFromHashOptions } from "./file.js";
export type { ProcessDependency } from "./dep.js";
export type { ProcessDefinition, EnvEntry } from "./process.js";
export type { DownloadOptions } from "./download.js";
export type { UnpackOptions, ArchiveFormat } from "./unpack.js";

// Recipe constructors
export { fileFromPath, fileFromHash } from "./file.js";
export { dep } from "./dep.js";
export { process } from "./process.js";
export { download } from "./download.js";
export { unpack } from "./unpack.js";

// Build script helpers
export { hermeticPreamble } from "./preamble.js";
export type { HermeticPreambleOptions } from "./preamble.js";
export { shellBuild } from "./shell.js";
export type { ShellBuildOptions } from "./shell.js";

// Import helpers
export { fromHod, importToStore } from "./import.js";
