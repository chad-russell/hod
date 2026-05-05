//! Integration tests for the CLI shell-out layer.
//!
//! These tests require `hod` to be on PATH (or HOD_BIN set).
//! They exercise the real `hod encode`, `hod decode`, `hod hash-file` commands.

import { describe, test, expect } from "bun:test";
import { encode, decode, hashFile, encodeJson, runHod } from "../src/cli.js";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TMP = join(tmpdir(), "hod-sdk-test-cli");

function setup() {
  mkdirSync(TMP, { recursive: true });
}

function cleanup() {
  rmSync(TMP, { recursive: true, force: true });
}

describe("cli", () => {
  test("hashFile computes BLAKE3 of a file", async () => {
    setup();
    const filePath = join(TMP, "test-hash.txt");
    writeFileSync(filePath, "hello, hod!");

    const hash = await hashFile(filePath);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    cleanup();
  });

  test("encode a file recipe JSON to .hod", async () => {
    setup();
    const jsonPath = join(TMP, "test-file.json");
    const hodPath = join(TMP, "test-file.hod");

    writeFileSync(
      jsonPath,
      JSON.stringify({
        type: "file",
        content_blob_hash: "a".repeat(64),
        executable: false,
      }),
    );

    const hash = await encode(jsonPath, hodPath);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    cleanup();
  });

  test("decode a .hod file back to JSON", async () => {
    setup();
    const jsonPath = join(TMP, "test-file.json");
    const hodPath = join(TMP, "test-file.hod");

    const recipeJson = {
      type: "file",
      content_blob_hash: "a".repeat(64),
      executable: false,
    };

    writeFileSync(jsonPath, JSON.stringify(recipeJson));
    await encode(jsonPath, hodPath);

    const decoded = await decode(hodPath);
    const parsed = JSON.parse(decoded);
    expect(parsed.type).toBe("file");
    expect(parsed.executable).toBe(false);
    cleanup();
  });

  test("encodeJson encodes a JSON object via temp file", async () => {
    const hash = await encodeJson({
      type: "file",
      content_blob_hash: "b".repeat(64),
      executable: true,
    });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("runHod throws on invalid command", async () => {
    await expect(runHod(["nonexistent-subcommand"])).rejects.toThrow();
  });
});
