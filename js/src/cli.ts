//! Shell-out wrappers for the `hod` CLI.
//!
//! All interactions with the hod binary go through here so that:
//! - There's one place to set the `hod` binary path (HOD_BIN env var or PATH)
//! - Errors from hod are consistently formatted
//! - Spawning is centralized for future caching / logging

import { spawn } from "child_process";
import { writeFileSync, mkdirSync, unlinkSync } from "fs";
import { dirname, join } from "path";
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
 * Encode a JSON object by writing it to a temp file and shelling out.
 * Returns the BLAKE3 hex hash.
 *
 * If `outputPath` is given, the .hod binary is also written there.
 */
export async function encodeJson(
  json: object,
  outputPath?: string,
): Promise<string> {
  const tmpPath = join(tmpdir(), `hod-sdk-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  try {
    mkdirSync(dirname(tmpPath), { recursive: true });
    writeFileSync(tmpPath, JSON.stringify(json));
    return await encode(tmpPath, outputPath);
  } finally {
    try { unlinkSync(tmpPath); } catch { /* ignore cleanup errors */ }
  }
}
