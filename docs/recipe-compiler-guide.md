# Recipe Compiler Guide

**Status:** Implemented. The Rust CLI helpers and Bun/TypeScript SDK exist and are the current recipe-authoring path.

This guide is practical: how recipes are authored, imported to the store, and built today.

## Overview

Hod recipes are deterministic binary records. The TypeScript SDK is the authoring layer; recipes are imported directly into the Hod store (no `.hod` files on disk in `recipes/`):

```text
TypeScript recipe code (.ts)
    │  Bun evaluates imports in dependency order
    ▼
TS SDK helpers (importToStore)
    │  shell out to `hod import-from-json`
    ▼
Hod store (SQLite + sharded blobs)
    │  recipe bytes stored by BLAKE3 hash
    ▼
hod build --hash <hex>
    │  reads recipe from store, builds recursively
    ▼
build output (also in the store)
```

The SDK is intentionally **single-phase**:

- No resolver is involved.
- No symbolic path refs are emitted.
- Dependencies are concrete BLAKE3 recipe hashes by the time a Process recipe is encoded.
- TS module imports provide normal DAG ordering: imported modules run before importers.

Path-ref / resolver support is still deferred. In the current tree, recipes
must encode concrete dependency hashes directly.

## Debugging Tools

### `hod inspect <hash>`

Print a recipe's JSON representation directly from the store. No `.hod` file needed.

```bash
hod inspect 4400c77b29493f69878e9f87661759b181aa699e346c9dea902861badf020d93
```

### `hod export-recipe <hash> -o <path>`

Write the raw `.hod` binary from the store to a file for deep debugging.

```bash
hod export-recipe 4400c77b... -o /tmp/busybox.hod
```

### `hod decode <file.hod>`

Decode a `.hod` file on disk to JSON. Useful with `export-recipe`.

```bash
hod export-recipe <hash> -o /tmp/test.hod
hod decode /tmp/test.hod
```

### `hod encode <input.json> [--output <output.hod>]`

Encode a JSON recipe to binary. Prints the recipe hash to stdout.

### `hod hash-file <file>`

Compute the BLAKE3 hash of a file's raw bytes. For File recipes, this is the `content_blob_hash`, not the recipe hash.

### `hod import-recipe <recipe.hod>`

Import an existing `.hod` recipe file into the store. Supports `--store` flag.

## TypeScript SDK

The SDK lives in `js/src/` and is exported from `js/src/index.ts`.

```typescript
import {
  fileFromPath,
  fileFromHash,
  download,
  unpack,
  process,
  dep,
  fromHod,
  importToStore,
  shellBuild,
  hermeticPreamble,
  HOD_DUMMY_RUNPATH,
  HOD_DUMMY_RPATH_FLAG,
} from "hod-sdk";
```

When running directly from this repo, examples commonly import from `../../js/src/index.js` instead.

Build-system-specific helpers (`cargoBuild`, `cProfile`, `rustProfile`) live in
`recipes/helpers/` — not in the SDK.  See `docs/agent-package-guide.md` for
usage patterns.

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

### `fileFromHash(hash, options?)`

Creates a File recipe from a known content hash (no file on disk needed).

```typescript
const busybox = await fileFromHash(
  "41eee14fead1f5f637e613b5bb865caab4fd3624f6bf5ebbe5280de5a8a6abac",
  { executable: true },
);
```

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

### `unpack({ archive_hash, format })`

Creates an Unpack recipe.

```typescript
const toolchain = await unpack({
  archive_hash: "a77bdfcf09a27aacf21aba8cd4282e7adefc83f91769e0742864b77d0dd46fb2",
  format: "tar_gz",
});
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
    dep("seed", seedRecipe),
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

Path strings are intentionally rejected. Use `fromHod()` explicitly so it is clear when a file is being decoded/encoded.

### `fromHod(path)`

Import an existing `.hod` recipe file into TS code.

```typescript
const glibc = await fromHod("../cross/glibc.hod");
```

`fromHod()` runs `hod decode` to get JSON and `hod hash-file` to get the recipe hash.

### `importToStore(recipe)`

Import a recipe directly into the Hod store. Returns the recipe hash. This is the primary way recipes go from TS to the store — no `.hod` file is written to disk.

```typescript
await importToStore(recipe);
```

`importToStore()` shells out to `hod import-from-json`, piping the recipe JSON on stdin. The recipe is encoded to binary and stored by its BLAKE3 hash.

## Example: Leaf Recipe (Download)

```typescript
//! hello source download.
import { download, importToStore } from "../../js/src/index.js";

const recipe = await download({
  url: "https://example.com/hello-1.0.tar.gz",
  hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
});

await importToStore(recipe);
export const helloSourceRecipe = recipe;
```

## Example: Process Recipe with TS Imports

```typescript
//! hello build recipe.
import { process, dep, importToStore } from "../../js/src/index.js";
import { helloSourceRecipe } from "./hello-source.js";
import { seedRootRecipe } from "../bootstrap/seed-root.js";
import { shimsBundleRecipe } from "../shims/shims-bundle.js";

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: ["sh", "-c", `
    set -e
    cd /deps/source
    ./configure --prefix=/
    make
    make install DESTDIR=$OUT
  `],
  dependencies: [
    dep("seed", seedRootRecipe),
    dep("shims", shimsBundleRecipe),
    dep("source", helloSourceRecipe),
  ],
});

await importToStore(recipe);
export const helloRecipe = recipe;
```

Run with Bun (imports recipe to store):

```bash
bun run recipes/native/hello/hello.ts
```

Then build by hash:

```bash
# Get the hash from the TS output or inspect
hod build --hash <recipe-hash>
```

## Current Project Layout

```text
js/
  src/
    index.ts      public exports
    cli.ts        hod subprocess wrappers
    elf.ts        HOD_DUMMY_RUNPATH / HOD_DUMMY_RPATH_FLAG
    file.ts       fileFromPath(), fileFromHash()
    download.ts   download()
    unpack.ts     unpack()
    fetch.ts      fetchTarball()
    process.ts    process()
    dep.ts        dep()
    shell.ts      shellBuild() — thin sandbox runner
    preamble.ts   hermeticPreamble()
    import.ts     fromHod(), importToStore()
  tests/          Bun tests
recipes/
  helpers/
    c.ts          cProfile() — C build environment
    rust.ts       rustProfile() + cargoBuild() — Rust build environment
  **/*.ts         TypeScript recipe files — sole source of truth
                 (no .hod or .json files)
```

## Recipe Authoring Workflow

1. Create a `.ts` file that imports dependencies from other `.ts` recipe modules.
2. Use SDK constructors (`download()`, `process()`, `fileFromHash()`, `unpack()`, `fetchTarball()`) to define the recipe.
3. Call `importToStore(recipe)` to import the recipe into the Hod store.
4. Export the recipe for downstream `.ts` files to import.
5. Run with `bun run <file>.ts` to import recipes to the store.
6. Build with `hod build --hash <hash>` or `hod build <file.hod>`.

Useful commands for verification:

```bash
hod inspect <hash>                 # inspect recipe JSON from the store
hod export-recipe <hash> -o out.hod # export binary for deep debugging
hod decode <file.hod>              # decode an exported .hod file
```

## Implemented vs Deferred

Implemented:

- `hod encode`
- `hod decode`
- `hod hash-file`
- `hod import-recipe` (with `--store` flag)
- `hod import-from-json` (reads JSON from stdin, imports to store)
- `hod inspect <hash>` (reads recipe from store, prints JSON)
- `hod export-recipe <hash> -o <path>` (writes raw recipe bytes to file)
- `hod build --hash <hex>` (build from store by recipe hash)
- TS `fileFromPath()`
- TS `fileFromHash()`
- TS `download()`
- TS `unpack()`
- TS `fetchTarball()` (composes download + unpack with format auto-detection and strip-components=1)
- TS `process()`
- TS `dep()`
- TS `fromHod()`
- TS `importToStore()`
- internal TS CLI helper `importFromJson()` (used by `importToStore()`)
- Rust `Unpack` encode/decode support

Deferred / caveats:

- Directory and Symlink TS constructors are not implemented.
- `hod resolve` / path refs are deferred; there is no checked-in standalone resolver design doc in this tree.
- Some E2E process tests are ignored because their fixtures still assume `/bin/bash`; they need hermetic shell fixtures to run inside Hod's sandbox.
