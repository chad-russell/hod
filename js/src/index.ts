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
export type { FetchTarballOptions } from "./fetch.js";
export type { FetchGitOptions } from "./git-fetch.js";

// Recipe constructors
export { fileFromPath, fileFromHash } from "./file.js";
export { dep } from "./dep.js";
export { process } from "./process.js";
export { download } from "./download.js";
export { unpack } from "./unpack.js";

// Source fetching
export { fetchTarball } from "./fetch.js";
export { fetchGit } from "./git-fetch.js";

// Build script helpers
export { hermeticPreamble } from "./preamble.js";
export type { HermeticPreambleOptions } from "./preamble.js";
export { shellBuild } from "./shell.js";
export type { ShellBuildOptions } from "./shell.js";
export { depPath, depSubpath, pathList, depSubpathList, appendPath, mergeEnv } from "./env.js";
// cargoBuild has moved to recipes/helpers/rust.ts

// ELF relocation constants
export { HOD_DUMMY_RUNPATH, HOD_DUMMY_RPATH_FLAG } from "./elf.js";

// Import helpers
export { fromHod, importToStore } from "./import.js";

// System configuration
export { defineSystem, buildSystemOutput } from "./system.js";
export type { SystemConfig, SystemUser, SystemGroup, SystemDefinition } from "./system.js";

// Systemd unit helpers
export { userUnit, unitToIni } from "./systemd.js";
export type { SystemdUnitConfig, SystemdSection, SystemdValue, UserUnitDefinition } from "./systemd.js";

// Profile file management
export { homeFile, configFile, sourceFile, homeDir } from "./profile-files.js";
export type { ManagedFileDefinition } from "./profile-files.js";
