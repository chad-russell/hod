//! Shell-out wrappers for the `hod` CLI.
//!
//! All interactions with the hod binary go through here so that:
//! - There's one place to set the `hod` binary path (HOD_BIN env var or PATH)
//! - Errors from hod are consistently formatted
//! - Spawning is centralized for future caching / logging

import { spawn } from "child_process";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/** Resolve the hod binary path. Checks HOD_BIN env var first, then PATH. */
function hodBin(): string {
  return process.env.HOD_BIN ?? "hod";
}

/** Run a hod subcommand and capture stdout. Throws on non-zero exit. */
export async function runHod(args: string[]): Promise<string> {
  const bin = hodBin();

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));

    child.on("close", (code) => {
      const stdout = Buffer.concat(chunks).toString("utf-8");
      const stderr = Buffer.concat(errChunks).toString("utf-8");

      if (code !== 0) {
        const cmd = `${bin} ${args.join(" ")}`;
        reject(new Error(`hod exited ${code}: ${cmd}\n${stderr}`));
      } else {
        resolve(stdout);
      }
    });

    child.on("error", (err) => {
      reject(new Error(`failed to spawn ${bin}: ${err.message}`));
    });
  });
}

/**
 * Register a recipe hash as the active `hod-launcher` in the store.
 *
 * The launcher is build-system infrastructure (stamped over wrapped
 * executables during post-build fixup), not a recipe dependency. Recording its
 * recipe hash here lets the build system build/read it without any package
 * declaring `hod-launcher` in its deps. The recipe must already be imported.
 */
export async function registerLauncher(recipeHash: string): Promise<void> {
  await runHod(["register-launcher", recipeHash]);
}

/**
 * Encode a JSON recipe file to binary .hod format.
 * Returns the BLAKE3 hex hash of the encoded bytes.
 */
export async function encode(
  jsonFilePath: string,
  outputPath?: string,
): Promise<string> {
  const args = ["encode", jsonFilePath];
  if (outputPath) {
    args.push("--output", outputPath);
  }
  const stdout = await runHod(args);
  return stdout.trim(); // the hash (64 hex chars)
}

/**
 * Decode a binary .hod file to a JSON string.
 */
export async function decode(hodFilePath: string): Promise<string> {
  const stdout = await runHod(["decode", hodFilePath]);
  return stdout;
}

/**
 * Compute the BLAKE3 hash of a file.
 * Returns the hex hash (64 characters).
 */
export async function hashFile(filePath: string): Promise<string> {
  const stdout = await runHod(["hash-file", filePath]);
  return stdout.trim();
}

/**
 * Encode a JSON object by writing it to a temporary JSON file and shelling out.
 * Returns the BLAKE3 hex hash.
 *
 * If `outputPath` is given, the .hod binary is written there. The JSON file is
 * only an intermediate representation and is removed before this function
 * returns.
 */
export async function encodeJson(
  json: object,
  outputPath?: string,
): Promise<string> {
  const tmpDir = mkdtempSync(join(tmpdir(), "hod-sdk-"));
  const tmpPath = join(tmpDir, "recipe.json");

  try {
    writeFileSync(tmpPath, JSON.stringify(json, null, 2) + "\n");
    return await encode(tmpPath, outputPath);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Import a file as a content blob into the store.
 * Returns the BLAKE3 hex hash of the blob.
 *
 * Idempotent: importing a blob that already exists in the store is a no-op.
 */
export async function importBlob(
  filePath: string,
  storePath?: string,
): Promise<string> {
  const args = ["import-blob", filePath];
  if (storePath) {
    args.push("--store", storePath);
  }
  const stdout = await runHod(args);
  return stdout.trim();
}

/**
 * Import a recipe from JSON directly into the store via stdin.
 * Returns the BLAKE3 hex hash.
 *
 * This shells out to `hod import-from-json`, piping the JSON on stdin.
 * The recipe is encoded to binary and stored. No files are left on disk.
 */
export async function importFromJson(
  json: object,
  storePath?: string,
): Promise<string> {
  const bin = hodBin();
  const args = ["import-from-json"];
  if (storePath) {
    args.push("--store", storePath);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));

    child.stdin.write(JSON.stringify(json));
    child.stdin.end();

    child.on("close", (code) => {
      const stdout = Buffer.concat(chunks).toString("utf-8");
      const stderr = Buffer.concat(errChunks).toString("utf-8");

      if (code !== 0) {
        const cmd = `${bin} ${args.join(" ")}`;
        reject(new Error(`hod exited ${code}: ${cmd}\n${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });

    child.on("error", (err) => {
      reject(new Error(`failed to spawn ${bin}: ${err.message}`));
    });
  });
}
