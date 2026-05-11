//! Tests for recipe constructors (fileFromPath, process, dep).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { fileFromPath, fileFromHash, dep, process, download, unpack, fromHod, importToStore, shellBuild } from "../src/index.js";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
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



describe("shellBuild", () => {
  test("creates a shell build recipe with shell and preamble", async () => {
    const recipe = await shellBuild({
      shell: "/deps/toolchain/bin/busybox",
      preamble: "export PATH=/deps/toolchain/bin",
      script: "echo hello > $OUT/hello.txt",
      env: { C_INCLUDE_PATH: "" },
      deps: [
        dep("source", "a".repeat(64)),
        dep("toolchain", "b".repeat(64)),
      ],
    });

    const json = recipe.json as any;
    expect(json.command).toBe("/deps/toolchain/bin/busybox");
    expect(json.dependencies.map((d: any) => d.name)).toEqual(["source", "toolchain"]);
    expect(json.env).toContainEqual({ key: "C_INCLUDE_PATH", value: "" });
    expect(json.args[2]).toContain("set -e");
    expect(json.args[2]).toContain("export PATH=/deps/toolchain/bin");
    expect(json.args[2]).toContain("echo hello > $OUT/hello.txt");
  });

  test("requires shell parameter", async () => {
    await expect(shellBuild({
      shell: "",
      script: "true",
      deps: [dep("source", "a".repeat(64))],
    })).rejects.toThrow(/shell is required/);
  });

  test("requires script parameter", async () => {
    await expect(shellBuild({
      shell: "/bin/busybox",
      script: "",
      deps: [],
    })).rejects.toThrow(/script is required/);
  });

  test("allows callers to pass env vars", async () => {
    const recipe = await shellBuild({
      shell: "/deps/toolchain/bin/busybox",
      script: "true",
      env: { C_INCLUDE_PATH: "/custom/include", FOO: "bar" },
      deps: [dep("toolchain", "b".repeat(64))],
    });

    const env = Object.fromEntries((recipe.json as any).env.map((entry: any) => [entry.key, entry.value]));
    expect(env.C_INCLUDE_PATH).toBe("/custom/include");
    expect(env.FOO).toBe("bar");
  });

  test("works without preamble or env", async () => {
    const recipe = await shellBuild({
      shell: "/bin/sh",
      script: "echo hello",
      deps: [],
    });

    const json = recipe.json as any;
    expect(json.command).toBe("/bin/sh");
    expect(json.env).toEqual([]);
    expect(json.args[2]).toContain("set -e");
    expect(json.args[2]).toContain("echo hello");
  });
});

describe("download", () => {
  test("creates a Download recipe", async () => {
    const recipe = await download({
      url: "https://example.com/foo.tar.gz",
      hash: "a".repeat(64),
    });
    expect(recipe.hash).toHaveLength(64);
    expect(recipe.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(recipe.json).toEqual({
      type: "download",
      url: "https://example.com/foo.tar.gz",
      hash_algorithm: "blake3",
      expected_hash: "a".repeat(64),
    });
  });

  test("round-trips through import and inspect", async () => {
    const recipe = await download({
      url: "https://example.com/bar.tar.xz",
      hash: "b".repeat(64),
    });

    const hash = await importToStore(recipe);
    expect(hash).toBe(recipe.hash);

    const { runHod } = await import("../src/cli.js");
    const inspectOutput = await runHod(["inspect", hash]);
    const inspected = JSON.parse(inspectOutput);
    expect(inspected.url).toBe("https://example.com/bar.tar.xz");
  });

  test("rejects invalid hash", async () => {
    await expect(download({ url: "https://example.com", hash: "not-a-hash" })).rejects.toThrow(/invalid hash/);
  });
});

describe("unpack", () => {
  test("creates an Unpack recipe with tar_gz", async () => {
    const recipe = await unpack({
      archive_hash: "a".repeat(64),
      format: "tar_gz",
    });
    expect(recipe.hash).toHaveLength(64);
    expect(recipe.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(recipe.json).toEqual({
      type: "unpack",
      archive_hash: "a".repeat(64),
      format: "tar_gz",
    });
  });

  test("creates an Unpack recipe with tar_xz", async () => {
    const recipe = await unpack({
      archive_hash: "b".repeat(64),
      format: "tar_xz",
    });
    expect((recipe.json as any).format).toBe("tar_xz");
  });

  test("round-trips through import and inspect", async () => {
    const recipe = await unpack({
      archive_hash: "c".repeat(64),
      format: "tar_gz",
    });

    const hash = await importToStore(recipe);
    expect(hash).toBe(recipe.hash);

    const { runHod } = await import("../src/cli.js");
    const inspectOutput = await runHod(["inspect", hash]);
    const inspected = JSON.parse(inspectOutput);
    expect(inspected.archive_hash).toBe("c".repeat(64));
    expect(inspected.format).toBe("tar_gz");
  });

  test("rejects invalid hash", async () => {
    await expect(unpack({ archive_hash: "short", format: "tar_gz" })).rejects.toThrow(/invalid hash/);
  });

  test("rejects invalid format", async () => {
    await expect(unpack({ archive_hash: "a".repeat(64), format: "zip" as any })).rejects.toThrow(/invalid format/);
  });
});

describe("fileFromHash", () => {
  test("creates a non-executable File recipe", async () => {
    const recipe = await fileFromHash("a".repeat(64));
    expect(recipe.hash).toHaveLength(64);
    expect(recipe.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(recipe.json).toEqual({
      type: "file",
      content_blob_hash: "a".repeat(64),
      executable: false,
    });
  });

  test("creates an executable File recipe", async () => {
    const recipe = await fileFromHash("b".repeat(64), { executable: true });
    expect((recipe.json as any).executable).toBe(true);
  });

  test("includes resources_hash when provided", async () => {
    const recipe = await fileFromHash("c".repeat(64), {
      executable: false,
      resources_hash: "d".repeat(64),
    });
    expect((recipe.json as any).resources_hash).toBe("d".repeat(64));
  });

  test("round-trips through import and inspect", async () => {
    const recipe = await fileFromHash("e".repeat(64));

    const hash = await importToStore(recipe);
    expect(hash).toBe(recipe.hash);

    const { runHod } = await import("../src/cli.js");
    const inspectOutput = await runHod(["inspect", hash]);
    const inspected = JSON.parse(inspectOutput);
    expect(inspected.type).toBe("file");
    expect(inspected.content_blob_hash).toBe("e".repeat(64));
  });

  test("rejects invalid content hash", async () => {
    await expect(fileFromHash("short")).rejects.toThrow(/invalid hash/);
  });

  test("rejects invalid resources_hash", async () => {
    await expect(fileFromHash("a".repeat(64), { resources_hash: "bad" })).rejects.toThrow(/invalid resources_hash/);
  });
});

describe("fromHod", () => {
  test("fromHod reads a .hod file and returns BuiltRecipe", async () => {
    // First create a .hod file using encodeJson from cli.ts
    const sourcePath = join(TMP, "from-hod-source.txt");
    writeFileSync(sourcePath, "source content");
    const recipe = await fileFromPath(sourcePath);

    const hodPath = join(TMP, "from-hod-test.hod");
    const { encodeJson } = await import("../src/cli.js");
    await encodeJson(recipe.json, hodPath);

    // Now import it
    const imported = await fromHod(hodPath);
    expect(imported.hash).toBe(recipe.hash);
    expect((imported.json as any).type).toBe("file");
  });
});

describe("importToStore", () => {
  test("imports a File recipe to the store and returns the hash", async () => {
    const recipe = await fileFromHash("f".repeat(64));
    const hash = await importToStore(recipe);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // Same recipe should produce the same hash
    expect(hash).toBe(recipe.hash);
  });

  test("imports a Download recipe to the store", async () => {
    const recipe = await download({
      url: "https://example.com/test.tar.gz",
      hash: "a".repeat(64),
    });
    const hash = await importToStore(recipe);
    expect(hash).toBe(recipe.hash);
  });

  test("imports a Process recipe to the store", async () => {
    const recipe = await process({
      platform: "x86_64-linux",
      command: "/bin/true",
      dependencies: [],
    });
    const hash = await importToStore(recipe);
    expect(hash).toBe(recipe.hash);
  });

  test("imported recipe is inspectable via hod inspect", async () => {
    const recipe = await fileFromHash("e".repeat(64), { executable: true });
    const hash = await importToStore(recipe);

    // Use runHod to verify it's in the store
    const { runHod } = await import("../src/cli.js");
    const inspectOutput = await runHod(["inspect", hash]);
    const inspected = JSON.parse(inspectOutput);
    expect(inspected.type).toBe("file");
    expect(inspected.executable).toBe(true);
    expect(inspected.content_blob_hash).toBe("e".repeat(64));
  });
});
