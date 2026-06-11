//! Profile file management — homeFile, configFile, sourceFile, homeDir.
//!
//! These helpers import file content into the hod store as blobs and return
//! ManagedFileDefinition objects for inclusion in a profile's `files` array.
//! During activation, Rust reads the blobs from the store, writes them to the
//! farm, and creates symlinks from target paths.

import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { importBlob } from "./cli.js";

export interface ManagedFileDefinition {
  target: string;
  content_hash: string;
  executable: boolean;
}

async function storeTextContent(text: string): Promise<string> {
  const tmpDir = mkdtempSync(join(tmpdir(), "hod-file-"));
  const tmpPath = join(tmpDir, "content");
  try {
    writeFileSync(tmpPath, text);
    return await importBlob(tmpPath);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function homeFile(
  target: string,
  opts: { text: string; executable?: boolean },
): Promise<ManagedFileDefinition> {
  const content_hash = await storeTextContent(opts.text);
  return {
    target,
    content_hash,
    executable: opts.executable ?? false,
  };
}

export async function sourceFile(
  target: string,
  path: string,
  base: string,
  opts?: { executable?: boolean },
): Promise<ManagedFileDefinition> {
  const absPath = new URL(path, base).pathname;
  const content_hash = await importBlob(absPath);
  return {
    target,
    content_hash,
    executable: opts?.executable ?? false,
  };
}

export async function configFile(
  target: string,
  opts: { text: string; executable?: boolean },
): Promise<ManagedFileDefinition> {
  return homeFile(`.config/${target}`, opts);
}

export async function homeDir(
  target: string,
  files: Record<
    string,
    { text: string; executable?: boolean } | { source: string; base: string; executable?: boolean }
  >,
): Promise<ManagedFileDefinition[]> {
  const results: ManagedFileDefinition[] = [];
  for (const [name, opts] of Object.entries(files)) {
    const fullPath = `${target}/${name}`;
    if ("source" in opts) {
      results.push(await sourceFile(fullPath, opts.source, opts.base, opts));
    } else {
      results.push(await homeFile(fullPath, opts));
    }
  }
  return results;
}
