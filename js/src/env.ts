//! Generic sandbox path and environment helpers.
//!
//! These helpers know only Hod's universal dependency mount convention:
//! named deps are mounted at /deps/<name>. They intentionally do not encode
//! C/Rust/Go/etc. build policy.

/** Return the sandbox mount path for a named dependency. */
export function depPath(name: string): string {
  assertDepName(name);
  return `/deps/${name}`;
}

/** Return a sandbox subpath inside a named dependency. */
export function depSubpath(name: string, subpath: string): string {
  assertDepName(name);
  const clean = cleanRelativeSubpath(subpath);
  return clean === "" ? depPath(name) : `${depPath(name)}/${clean}`;
}

/** Join path entries with ':' for PATH-like environment variables. */
export function pathList(paths: readonly string[]): string {
  return paths.filter((p) => p.length > 0).join(":");
}

/** Build a PATH-like list of the same subpath under each dependency. */
export function depSubpathList(names: readonly string[], subpath: string): string {
  return pathList(names.map((name) => depSubpath(name, subpath)));
}

/** Append entries to an existing PATH-like environment variable value. */
export function appendPath(existing: string | undefined, entries: readonly string[]): string {
  const parts = [...(existing && existing.length > 0 ? [existing] : []), ...entries];
  return pathList(parts);
}

/** Merge environment records left-to-right; later records override earlier ones. */
export function mergeEnv(...envs: Array<Record<string, string> | undefined>): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const env of envs) {
    if (!env) continue;
    for (const [key, value] of Object.entries(env)) {
      merged[key] = value;
    }
  }
  return merged;
}

function assertDepName(name: string): void {
  if (name.length === 0) {
    throw new Error("dependency name must not be empty");
  }
  if (name.includes("/") || name === "." || name === ".." || name.includes("\0")) {
    throw new Error(`invalid dependency name: ${JSON.stringify(name)}`);
  }
}

function cleanRelativeSubpath(subpath: string): string {
  if (subpath.includes("\0")) {
    throw new Error("subpath must not contain NUL");
  }

  const parts = subpath.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.some((part) => part === "..")) {
    throw new Error(`subpath must be relative and must not contain '..': ${JSON.stringify(subpath)}`);
  }
  return parts.join("/");
}
