# Recipe Compiler — Design

**Date:** 2026-05-04
**Status:** Partially implemented

> Current status: the Rust CLI commands and the basic Bun/TypeScript SDK exist. The SDK is intentionally single-phase and produces concrete-hash recipes; it does not use the deferred resolver/path-reference design in [`evaluator-resolver-prd.md`](evaluator-resolver-prd.md).

## 1. Goal

Replace hand-written JSON recipes with TypeScript/Bun files that ergonomically produce `.hod` binary recipes. The TS library is a set of building blocks — not a framework. It imposes no convention on file layout or execution model; it provides helpers for defining recipes, writing them to disk, and cross-referencing dependencies.

## 2. Architecture

```
TypeScript (.ts files)
    │
    │  import/evaluate (Bun's module resolution)
    ▼
TS SDK helpers
    │
    │  shell out to hod CLI
    ▼
hod encode / hod decode / hod hash-file
    │
    │  read/write
    ▼
.hod files (binary) + .json files (human-readable)
```

**Single-phase.** No resolver. JS module execution order is topological — `import`ed modules evaluate before the importer. Leaf recipes (File, Download) have no recipe dependencies and compute their hashes immediately. Process recipes reference dep hashes that are already known because the dep module already ran. The circular dependency problem does not exist in a DAG. This is the current implementation direction; path refs and `hod resolve` are deferred.

**No BLAKE3 in TypeScript.** All hashing is delegated to the `hod` CLI via subprocess. The TS library constructs JSON, shells out to `hod encode`, and captures the resulting hash from stdout.

## 3. CLI Commands

These subcommands exist in the `hod` binary and are thin wrappers around serde JSON ↔ binary encode/decode plus BLAKE3 hashing.

### 3.1 `hod encode`

```
hod encode <input.json> [--output <output.hod>]
```

- Reads a JSON recipe from `<input.json>`
- Deserializes it with `serde_json` into `Recipe`, then encodes it with `Recipe::encode()`
- If `--output` is given, writes the `.hod` binary to that path
- Prints the BLAKE3 hash of the encoded bytes to stdout (hex, 64 chars)
- Exit 0 on success, non-zero on error (invalid JSON, unknown recipe type, etc.)

The TS library calls this to convert JSON → `.hod` and get the recipe hash.

### 3.2 `hod decode`

```
hod decode <input.hod> [--output <output.json>]
```

- Reads a binary `.hod` file
- Decodes it using the existing `Recipe::decode` path
- Writes pretty-printed JSON to `--output` (or stdout if no `--output`)
- Exit 0 on success, non-zero on error (invalid binary, bad magic, etc.)

Primarily a debugging/inspection tool.

### 3.3 `hod hash-file`

```
hod hash-file <file>
```

- Reads the file and computes its BLAKE3 hash
- Prints the hex hash (64 chars) to stdout
- No side effects — pure computation

Used by the TS library to compute `content_blob_hash` for File recipes. This is the content hash of the file's *bytes*, not the recipe hash. (The recipe hash comes from `hod encode`.)

## 4. TypeScript SDK API

### 4.1 Core types

```typescript
/** A recipe that has been encoded and has a known hash. */
interface BuiltRecipe {
  /** BLAKE3 hex hash of the encoded .hod bytes. */
  hash: string;
  /** The JSON object (for inspection, debugging, or writing to disk). */
  json: object;
}
```

Every recipe-creating function returns a `Promise<BuiltRecipe>`.

### 4.2 Recipe constructors

#### `fileFromPath(path, options?)`

Creates a File recipe from a file on disk. Shells out to `hod hash-file` to get the content blob hash, then to `hod encode` to get the recipe hash.

```typescript
const buildScript = await fileFromPath("./build-gcc.sh", { executable: true });
// buildScript.hash → recipe hash
// buildScript.json → { type: "file", content_blob_hash: "...", executable: true }
```

#### `process(definition)`

Creates a Process recipe. Shells out to `hod encode` to get the recipe hash.

```typescript
const bash = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: ["sh", "-c", "..."],
  env: { CC: "gcc", CFLAGS: "-O2" },
  dependencies: [
    dep("glibc", glibcRecipe),
    dep("seed", await fromHod("../bootstrap/seed-root.hod")),
  ],
  runtime_deps: ["glibc"],
});
```

The `dependencies` list accepts `dep()` entries whose hash argument can be:
- A `BuiltRecipe` object (from another TS module or constructor)
- A string hex hash (if you already know it)

For existing files, first call `fromHod(path)` or `fromJson(path)`, then pass the returned `BuiltRecipe` to `dep()`.

### 4.3 Dependency helper

#### `dep(name, hashSource)`

Creates a dependency entry. `hashSource` is one of:
- A `BuiltRecipe` — uses `.hash`
- A string — treated as a 64-character hex hash (for hardcoded/known hashes)

Path strings are intentionally rejected by `dep()` today; use `fromHod()` or `fromJson()` explicitly.

```typescript
dep("glibc", glibcRecipe)            // BuiltRecipe from import
dep("seed", seedRecipe)              // BuiltRecipe from import
dep("source", await fromHod("../bash-source.hod"))
dep("manual", "891a64e6...")         // hardcoded hex hash
```

### 4.4 Import helpers

#### `fromHod(path)`

Reads an existing `.hod` file, shells out to `hod decode` to get the JSON, and uses `hod hash-file` on the `.hod` bytes to get the recipe hash. Returns `Promise<BuiltRecipe>`.

```typescript
const glibc = await fromHod("../cross/glibc.hod");
```

#### `fromJson(path)`

Reads an existing `.json` recipe file, shells out to `hod encode` to get the hash. Returns `Promise<BuiltRecipe>`.

```typescript
const glibc = await fromJson("../cross/glibc.json");
```

### 4.5 Output helpers

#### `writeHod(recipe, outputPath)`

Writes the `.hod` binary to disk. Shells out to `hod encode <(json) --output <path>`. Returns the hash.

```typescript
writeHod(bash, "./bash.hod");
```

#### `writeJson(recipe, outputPath)`

Writes the JSON representation to disk. Pure TypeScript (just `JSON.stringify` + `fs.writeFile`). Returns the hash.

```typescript
writeJson(bash, "./bash.json");
```

#### Store import

The Rust CLI now has `hod import-recipe <recipe.hod>`, but the TS SDK does not currently expose `importToStore()`. Use `writeHod()` followed by `hod import-recipe` if you need to import from scripts. Current limitation: `import-recipe` does not accept a `--store` flag.

## 5. Usage Patterns

### 5.1 Cross-referencing via TS imports

The primary pattern. Module execution order handles the DAG automatically.

```typescript
// recipes/native/glibc/glibc.ts
import { process, fileFromPath, dep, writeHod, writeJson } from "hod-sdk";

const source = await fileFromPath("../../sources/glibc-source.json"); // or fromHod, etc.
// ... but actually, sources are Download recipes. Let's use a realistic example:

const glibc = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: ["sh", "-c", "...build commands..."],
  env: { ... },
  dependencies: [
    dep("source", await fromHod("../../sources/glibc-source.hod")),
    dep("seed", await fromHod("../../bootstrap/seed-root.hod")),
    dep("linux-headers", await fromHod("../../cross/linux-headers.hod")),
  ],
});

writeHod(glibc, "./glibc.hod");
writeJson(glibc, "./glibc.json");

export const glibcRecipe = glibc;
```

```typescript
// recipes/native/bash/bash.ts
import { process, dep, writeHod, writeJson } from "hod-sdk";
import { glibcRecipe } from "../glibc/glibc.ts";

const bash = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: ["sh", "-c", "..."],
  dependencies: [
    dep("glibc", glibcRecipe),
    dep("gcc-stage1", await fromHod("../../cross/gcc-stage1.hod")),
    dep("seed", await fromHod("../../bootstrap/seed-root.hod")),
    dep("source", await fromHod("../../sources/bash-source.hod")),
  ],
  runtime_deps: ["glibc"],
});

writeHod(bash, "./bash.hod");
writeJson(bash, "./bash.json");

export const bashRecipe = bash;
```

### 5.2 Single-file multi-recipe output

One TS file can produce multiple recipes:

```typescript
// recipes/native/gcc/gcc.ts
import { process, fileFromPath, dep, writeHod, writeJson } from "hod-sdk";

const buildScript = await fileFromPath("./build-gcc.sh", { executable: true });
const wrappers = await fileFromPath("./setup-gcc-wrappers.sh", { executable: true });

const gcc = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/bash",
  args: ["/deps/build-script/data"],
  dependencies: [
    dep("build-script", buildScript),
    dep("setup-wrappers", wrappers),
    dep("source", await fromHod("../../sources/gcc-source.hod")),
    dep("glibc", await fromHod("../../cross/glibc.hod")),
  ],
});

writeHod(buildScript, "./build-gcc.hod");
writeHod(wrappers, "./setup-gcc-wrappers.hod");
writeHod(gcc, "./gcc.hod");

writeJson(gcc, "./gcc.json");

export const gccRecipe = gcc;
export const buildScriptRecipe = buildScript;
```

### 5.3 Top-level orchestrator

A single entry point that imports everything and builds all recipes:

```typescript
// recipes/build.ts
import { writeHod } from "hod-sdk";
import { glibcRecipe } from "./glibc/glibc.ts";
import { bashRecipe } from "./bash/bash.ts";
import { gccRecipe } from "./gcc/gcc.ts";

await writeHod(glibcRecipe, "./out/glibc.hod");
await writeHod(bashRecipe, "./out/bash.hod");
await writeHod(gccRecipe, "./out/gcc.hod");

console.log("All recipes written. Import with: hod import-recipe ./out/<name>.hod");
```

Run with `bun run recipes/build.ts`.

## 6. Project Structure

```
hod/
├── src/                    # Rust source (existing)
├── js/                     # TypeScript SDK
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts        # Public API — re-exports everything
│   │   ├── process.ts      # process() constructor
│   │   ├── file.ts         # fileFromPath() constructor
│   │   ├── dep.ts          # dep() helper
│   │   ├── output.ts       # writeHod(), writeJson()
│   │   ├── import.ts       # fromHod(), fromJson()
│   │   ├── download.ts     # download() constructor
│   │   └── cli.ts          # Shell-out wrappers for hod encode/decode/hash-file
│   └── tests/
│       └── ...             # Bun test files
├── recipes/                # Recipe files (existing + new .ts files)
│   ├── bootstrap/          # (existing JSON — kept as-is)
│   ├── cross/              # (existing JSON — kept as-is)
│   ├── native/             # Migrated to .ts incrementally
│   │   ├── bash/
│   │   │   └── bash.ts
│   │   ├── glibc/
│   │   │   └── glibc.ts
│   │   └── ...
│   └── sources/            # Source download recipes
└── tests/                  # Rust tests (existing)
```

## 7. Open Questions / Deferred

| Topic | Decision | Notes |
|-------|----------|-------|
| Caching `hod encode` calls | Deferred | If the same JSON is encoded multiple times (e.g., imported by N recipes), the CLI is invoked N times. Can add an in-memory cache in the TS layer later. |
| TS `importToStore()` helper | Deferred | `hod import-recipe` exists, but the SDK does not wrap it yet; CLI also lacks `--store`. |
| Download recipe support | Implemented | `download()` constructor exists. |
| Directory / Symlink / Unpack recipe constructors | Deferred | `Unpack` exists in Rust encode/decode but its builder is a stub. |
| `hod encode` stdin mode | Nice-to-have | `echo '<json>' | hod encode --output foo.hod` would let the TS library pipe JSON via stdin instead of writing a temp file. Avoids temp file cleanup. |
| Recipe validation in TS | Nice-to-have | The TS constructors could validate required fields (non-empty command, sorted deps, etc.) before shelling out. But `hod encode` already validates — the TS layer can be thin. |

## 8. Implementation Order

1. **Add `hod encode`, `hod decode`, `hod hash-file` to the Rust CLI** — these are the foundation. Without them, nothing else works.
2. **Create `js/` directory with minimal SDK** — `process()`, `fileFromPath()`, `dep()`, `writeHod()`, `writeJson()`, `fromHod()`, `fromJson()`.
3. **Convert one existing recipe to TS** — e.g., `bash.ts` — as a proof of concept. Verify the produced `.hod` is identical to the hand-written one.
4. **Convert remaining recipes incrementally** — migrate one package at a time, verifying bit-identical output each time.
5. **Iterate on the API** — use the experience of converting recipes to refine the helpers. Add convenience wrappers as patterns emerge (e.g., `processWithSysroot()` for cross-compilation boilerplate).
