//! Tests for recipe constructors (fileFromPath, process, dep).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { fileFromPath, dep, process, writeHod, writeJson, fromHod, fromJson } from "../src/index.js";
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TMP = join(tmpdir(), "hod-sdk-test-recipes");

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("fileFromPath", () => {
  test("creates a File recipe from a file on disk", async () => {
    const filePath = join(TMP, "test.sh");
    writeFileSync(filePath, '#!/bin/sh\necho hello\n');

    const recipe = await fileFromPath(filePath);
    expect(recipe.hash).toHaveLength(64);
    expect(recipe.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(recipe.json).toEqual({
      type: "file",
      content_blob_hash: expect.any(String),
      executable: false,
    });
    expect((recipe.json as any).content_blob_hash).toHaveLength(64);
  });

  test("creates an executable File recipe", async () => {
    const filePath = join(TMP, "build.sh");
    writeFileSync(filePath, "#!/bin/sh\nmake\n");

    const recipe = await fileFromPath(filePath, { executable: true });
    expect((recipe.json as any).executable).toBe(true);
  });
});

describe("dep", () => {
  test("creates a dep from a BuiltRecipe", async () => {
    const filePath = join(TMP, "dep-source.txt");
    writeFileSync(filePath, "content");
    const fileRecipe = await fileFromPath(filePath);

    const d = dep("my-dep", fileRecipe);
    expect(d.name).toBe("my-dep");
    expect(d.recipe_hash).toBe(fileRecipe.hash);
  });

  test("creates a dep from a hex hash string", () => {
    const hash = "a".repeat(64);
    const d = dep("hardcoded", hash);
    expect(d.name).toBe("hardcoded");
    expect(d.recipe_hash).toBe(hash);
  });

  test("throws on invalid hash string", () => {
    expect(() => dep("bad", "not-a-hash")).toThrow(/invalid hash/);
    expect(() => dep("bad", "zzzz")).toThrow(/invalid hash/);
  });
});

describe("process", () => {
  test("creates a minimal Process recipe", async () => {
    const recipe = await process({
      platform: "x86_64-linux",
      command: "/bin/true",
      args: [],
      dependencies: [],
    });

    expect(recipe.hash).toHaveLength(64);
    expect(recipe.json).toMatchObject({
      type: "process",
      platform: "x86_64-linux",
      command: "/bin/true",
    });
  });

  test("sorts env by key", async () => {
    const recipe = await process({
      platform: "x86_64-linux",
      command: "/bin/sh",
      env: { Z_VAR: "z", A_VAR: "a", M_VAR: "m" },
      dependencies: [],
    });

    const json = recipe.json as any;
    const keys = json.env.map((e: any) => e.key);
    expect(keys).toEqual(["A_VAR", "M_VAR", "Z_VAR"]);
  });

  test("sorts dependencies by name", async () => {
    const recipe = await process({
      platform: "x86_64-linux",
      command: "/bin/sh",
      dependencies: [
        dep("zlib", "a".repeat(64)),
        dep("bash", "b".repeat(64)),
        dep("coreutils", "c".repeat(64)),
      ],
    });

    const json = recipe.json as any;
    const names = json.dependencies.map((d: any) => d.name);
    expect(names).toEqual(["bash", "coreutils", "zlib"]);
  });

  test("includes runtime_deps when specified", async () => {
    const recipe = await process({
      platform: "x86_64-linux",
      command: "/bin/sh",
      dependencies: [],
      runtime_deps: ["glibc", "bash"],
    });

    const json = recipe.json as any;
    expect(json.runtime_deps).toEqual(["glibc", "bash"]);
  });
});

describe("writeHod / writeJson", () => {
  test("writeJson writes a .json file", async () => {
    const filePath = join(TMP, "test-file.txt");
    writeFileSync(filePath, "test content");

    const recipe = await fileFromPath(filePath);
    const jsonPath = join(TMP, "output.json");

    const hash = writeJson(recipe, jsonPath);
    expect(hash).toBe(recipe.hash);
    expect(existsSync(jsonPath)).toBe(true);

    const written = JSON.parse(readFileSync(jsonPath, "utf-8"));
    expect(written).toEqual(recipe.json);
  });

  test("writeHod writes a .hod binary file", async () => {
    const filePath = join(TMP, "test-file2.txt");
    writeFileSync(filePath, "test content 2");

    const recipe = await fileFromPath(filePath);
    const hodPath = join(TMP, "output.hod");

    const hash = await writeHod(recipe, hodPath);
    expect(hash).toBe(recipe.hash);
    expect(existsSync(hodPath)).toBe(true);

    // The .hod file should start with "HOD" magic bytes
    const buf = readFileSync(hodPath);
    expect(buf[0]).toBe(0x48); // 'H'
    expect(buf[1]).toBe(0x4f); // 'O'
    expect(buf[2]).toBe(0x44); // 'D'
  });
});

describe("fromHod / fromJson", () => {
  test("fromHod reads a .hod file and returns BuiltRecipe", async () => {
    // First create a .hod file
    const sourcePath = join(TMP, "from-hod-source.txt");
    writeFileSync(sourcePath, "source content");
    const recipe = await fileFromPath(sourcePath);

    const hodPath = join(TMP, "from-hod-test.hod");
    await writeHod(recipe, hodPath);

    // Now import it
    const imported = await fromHod(hodPath);
    expect(imported.hash).toBe(recipe.hash);
    expect((imported.json as any).type).toBe("file");
  });

  test("fromJson reads a .json file and returns BuiltRecipe", async () => {
    const sourcePath = join(TMP, "from-json-source.txt");
    writeFileSync(sourcePath, "source content json");
    const recipe = await fileFromPath(sourcePath);

    const jsonPath = join(TMP, "from-json-test.json");
    writeJson(recipe, jsonPath);

    const imported = await fromJson(jsonPath);
    expect(imported.hash).toBe(recipe.hash);
    expect(imported.json).toEqual(recipe.json);
  });
});
