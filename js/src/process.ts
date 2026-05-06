//! Process recipe constructor.

import { encodeJson } from "./cli.js";
import type { BuiltRecipe } from "./file.js";
import type { ProcessDependency } from "./dep.js";

export interface EnvEntry {
  key: string;
  value: string;
}

export interface ProcessDefinition {
  /** Target platform, e.g. "x86_64-linux". */
  platform: string;
  /** Command to execute (resolved within deps). */
  command: string;
  /** Command-line arguments. */
  args?: string[];
  /** Environment variables — either a Record<string, string> or sorted {key, value}[]. */
  env?: Record<string, string> | EnvEntry[];
  /** Named dependencies (output of `dep()`). */
  dependencies: ProcessDependency[];
  /** Runtime dependencies for ELF relocation (JSON-only, not in binary format). */
  runtime_deps?: string[];
  /** Optional working directory contents hash. */
  workdir_hash?: string;
  /** Optional initial output directory contents hash. */
  output_scaffold_hash?: string;
  /** Bitmask of unsafe flags. Bit 0 = allow networking. */
  unsafe_flags?: number;
}

/**
 * Create a Process recipe.
 *
 * Normalizes env to sorted {key, value}[] and dependencies to sorted-by-name order
 * to ensure deterministic encoding.
 */
export async function process(definition: ProcessDefinition): Promise<BuiltRecipe> {
  // Normalize env: Record → sorted array
  let envEntries: EnvEntry[];
  if (!definition.env) {
    envEntries = [];
  } else if (Array.isArray(definition.env)) {
    envEntries = [...definition.env];
  } else {
    envEntries = Object.entries(definition.env).map(([key, value]) => ({ key, value }));
  }

  // Sort env by key (byte-level comparison, matching Rust's sort)
  envEntries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // Sort dependencies by name (byte-level comparison, matching Rust's sort)
  const deps = [...definition.dependencies].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );

  // Build the JSON object
  const json: Record<string, unknown> = {
    type: "process",
    platform: definition.platform,
    command: definition.command,
    args: definition.args ?? [],
    env: envEntries,
    dependencies: deps,
    unsafe_flags: definition.unsafe_flags ?? 0,
  };

  // Optional fields — only include if set
  if (definition.workdir_hash) {
    json.workdir_hash = definition.workdir_hash;
  }
  if (definition.output_scaffold_hash) {
    json.output_scaffold_hash = definition.output_scaffold_hash;
  }
  if (definition.runtime_deps && definition.runtime_deps.length > 0) {
    json.runtime_deps = definition.runtime_deps;
  }

  const hash = await encodeJson(json);
  return { hash, json };
}
