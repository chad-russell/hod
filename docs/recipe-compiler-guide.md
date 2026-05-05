# Recipe Compiler Guide

**Status:** Mostly implemented. The Rust CLI helpers and Bun/TypeScript SDK exist and are the current recipe-authoring path.

This guide replaces the old recipe-compiler design/task docs. It is meant to be practical: how to generate `.hod` files today, what is implemented, and what is still deferred.

## Overview

Hod recipes are still deterministic binary `.hod` files. The TypeScript SDK is just a convenience layer for creating those files from Bun/TS code:

```text
TypeScript recipe code
    │  Bun evaluates imports in dependency order
    ▼
TS SDK helpers
    │  shell out to hod CLI
    ▼
hod encode / hod decode / hod hash-file
    │
    ▼
.hod binary recipes + optional .json snapshots
```

The SDK is intentionally **single-phase**:

- No resolver is involved.
- No symbolic path refs are emitted.
- Dependencies are concrete BLAKE3 recipe hashes by the time a Process recipe is encoded.
- TS module imports provide normal DAG ordering: imported modules run before importers.

For the deferred path-ref resolver design, see [`evaluator-resolver-prd.md`](evaluator-resolver-prd.md). It is not implemented.

## Rust CLI Helpers

The SDK delegates all encoding and hashing to the `hod` binary.

### `hod encode`

```bash
hod encode <input.json> [--output <output.hod>]
```

- Reads JSON.
- Deserializes into `Recipe` with `serde_json`.
- Encodes with `Recipe::encode()`.
- Prints the recipe hash (`blake3(.hod bytes)`) to stdout.
- Writes binary `.hod` when `--output` is provided.

### `hod decode`

```bash
hod decode <input.hod> [--output <output.json>]
```

- Reads binary `.hod`.
- Decodes with `Recipe::decode()`.
- Writes pretty JSON to `--output`, or stdout if omitted.

### `hod hash-file`

```bash
hod hash-file <file>
```

Computes the BLAKE3 hash of a file’s raw bytes. For File recipes, this is the `content_blob_hash`, not the recipe hash.

### `hod import-recipe`

```bash
hod import-recipe <recipe.hod>
```

Imports an existing `.hod` recipe into the default store. Current limitation: no `--store` flag.

## TypeScript SDK

The SDK lives in `js/src/` and is exported from `js/src/index.ts`.

```typescript
import {
  fileFromPath,
  download,
  process,
  dep,
  fromHod,
  fromJson,
  writeHod,
  writeJson,
} from "hod-sdk";
```

When running directly from this repo, examples commonly import from `../../js/src/index.js` instead.

### Core Type

```typescript
interface BuiltRecipe {
  /** BLAKE3 hex hash of the encoded .hod bytes. */
  hash: string;
  /** JSON object used to encode the recipe. */
  json: object;
}
```

Recipe constructors return `Promise<BuiltRecipe>`.

### `fileFromPath(path, options?)`

Creates a File recipe from local file bytes.

```typescript
const script = await fileFromPath("./build.sh", { executable: true });
```

Implementation:

1. Runs `hod hash-file <path>` to compute `content_blob_hash`.
2. Constructs JSON: `{ type: "file", content_blob_hash, executable }`.
3. Runs `hod encode` to compute the recipe hash.

Note: this hashes the file, but does not by itself store the file blob in the Hod store.

### `download({ url, hash })`

Creates a Download recipe with BLAKE3 verification.

```typescript
const source = await download({
  url: "https://example.com/pkg.tar.gz",
  hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
});
```

The SDK validates that `hash` is a 64-character lowercase hex string and emits:

```json
{
  "type": "download",
  "url": "...",
  "hash_algorithm": "blake3",
  "expected_hash": "..."
}
```

### `process(definition)`

Creates a Process recipe.

```typescript
const pkg = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: ["sh", "-c", "echo hello > $OUT/message.txt"],
  env: { CC: "/deps/gcc/bin/gcc" },
  dependencies: [
    dep("seed", await fromHod("../bootstrap/seed-root.hod")),
    dep("source", source),
  ],
  unsafe_flags: 0,
});
```

The SDK normalizes for deterministic encoding:

- `env` may be a record or `{ key, value }[]`; it is sorted by key.
- `dependencies` are sorted by name.
- `args` defaults to `[]`.
- `unsafe_flags` defaults to `0`.

Optional fields supported by the SDK:

- `workdir_hash`
- `output_scaffold_hash`
- `runtime_deps`

`runtime_deps` is encoded as a backward-compatible Process tail field and is used by `build.rs` to run store-relative ELF relocation. See [`relocatable-binaries-guide.md`](relocatable-binaries-guide.md).

### `dep(name, source)`

Creates a named Process dependency.

```typescript
dep("glibc", glibcRecipe);              // BuiltRecipe
dep("manual", "891a64e6...");          // known 64-char hex hash
dep("source", await fromHod("src.hod"));
```

`source` may be:

- a `BuiltRecipe`, or
- a 64-character lowercase hex recipe hash.

Path strings are intentionally rejected. Use `fromHod()` or `fromJson()` explicitly so it is clear when a file is being decoded/encoded.

### `fromHod(path)` and `fromJson(path)`

Import existing recipe files into TS code.

```typescript
const glibc = await fromHod("../cross/glibc.hod");
const seed = await fromJson("../bootstrap/seed-root.json");
```

- `fromHod()` runs `hod decode` to get JSON and `hod hash-file` to get the recipe hash.
- `fromJson()` reads JSON and runs `hod encode` to get the recipe hash.

### `writeHod(recipe, path)` and `writeJson(recipe, path)`

Write generated recipes to disk.

```typescript
await writeHod(pkg, "./pkg.hod");
writeJson(pkg, "./pkg.json");
```

`writeHod()` shells out to `hod encode --output`. `writeJson()` is pure TypeScript.

## Example: Single Package

```typescript
import { download, process, dep, fromHod, writeHod, writeJson } from "hod-sdk";

const source = await download({
  url: "https://example.com/hello-1.0.tar.gz",
  hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
});

const seed = await fromHod("../bootstrap/seed-root.hod");

const hello = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: ["sh", "-c", `
    set -e
    tar xf /deps/source/source -C /tmp
    cd /tmp/hello-1.0
    ./configure --prefix=/
    make
    make install DESTDIR=$OUT
  `],
  dependencies: [
    dep("seed", seed),
    dep("source", source),
  ],
});

await writeHod(source, "./hello-source.hod");
writeJson(source, "./hello-source.json");

await writeHod(hello, "./hello.hod");
writeJson(hello, "./hello.json");

console.log(hello.hash);
```

Run with Bun:

```bash
bun run recipes/native/hello/hello.ts
```

## Current Project Layout

```text
js/
  src/
    index.ts      public exports
    cli.ts        hod subprocess wrappers
    file.ts       fileFromPath()
    download.ts   download()
    process.ts    process()
    dep.ts        dep()
    import.ts     fromHod(), fromJson()
    output.ts     writeHod(), writeJson()
  tests/          Bun tests
```

Recipe experiments and migrations currently live beside checked-in recipes under `recipes/`.

## Migration Workflow

1. Pick an existing JSON recipe.
2. Create a `.ts` file beside it.
3. Use `fromHod()` / `fromJson()` for existing dependencies.
4. Generate `.hod` and `.json` outputs with `writeHod()` / `writeJson()`.
5. Compare output hashes and, when expected, binary identity with the hand-written `.hod`.
6. Commit both the TS source and generated recipe files if they are intended to be tracked.

Useful commands:

```bash
hod decode old.hod --output old.json
hod encode generated.json --output generated.hod
hod hash-file generated.hod
cmp old.hod generated.hod
```

## Implemented vs Deferred

Implemented:

- `hod encode`
- `hod decode`
- `hod hash-file`
- `hod import-recipe` (default store only)
- TS `fileFromPath()`
- TS `download()`
- TS `process()`
- TS `dep()`
- TS `fromHod()` / `fromJson()`
- TS `writeHod()` / `writeJson()`
- Rust `Unpack` encode/decode support

Deferred / caveats:

- TS `importToStore()` helper is not implemented.
- `hod import-recipe` does not accept `--store`.
- Directory, Symlink, and Unpack TS constructors are not implemented.
- Rust `Unpack` building is a stub (`build_unpack` returns unsupported).
- `hod resolve` / path refs are deferred; see [`evaluator-resolver-prd.md`](evaluator-resolver-prd.md).
- Some E2E process tests are ignored because their fixtures still assume `/bin/bash`; they need hermetic shell fixtures to run inside Hod's sandbox.
