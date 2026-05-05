# Recipe Compiler — Task List

**Reference:** [docs/recipe-compiler-design.md](docs/recipe-compiler-design.md)

## Phase 0: Rust Recipe Types

### Task 0.1: `Unpack` recipe type ✅

- [x] Add `Unpack = 0x06` to `RecipeType` enum in `src/recipe.rs`
- [x] Add `RecipeUnpack` struct with `archive_hash` (Hash) and `format` (ArchiveFormat enum: `tar_gz`, `tar_xz`)
- [x] Add `ArchiveFormat` enum with serde rename (`tar_gz`, `tar_xz`)
- [x] Add `Unpack` variant to `Recipe` enum with serde tag `"unpack"`
- [x] Implement `encode_body` for `RecipeUnpack` (hash + u8 format tag)
- [x] Implement `decode_unpack` body decoder
- [x] Add `RecipeType::from_u8(0x06)` mapping
- [x] Add `Unpack` to `build.rs` `format_recipe_type()` and recipe dispatch (stub)
- [x] Update `recipe_encoding.rs` test: `from_u8(0x06)` now returns `Some(Unpack)`
- [x] Binary round-trip tests for `tar_gz` and `tar_xz` in `recipe_json_roundtrip.rs`
- [x] JSON format test: `"type":"unpack"` and `"format":"tar_gz"`
- [x] `cargo test` passes (all recipe encoding/decoding tests)

## Phase 1: Rust CLI Commands

These are the foundation — the TS library shells out to these.

### Task 1.1: `hod encode` ✅

- [x] Add `Encode` variant to `Commands` enum in `src/main.rs`
- [x] Accept `<input.json>` positional arg, `--output <path>` optional flag
- [x] Add `serde` + `serde_json` to Cargo.toml
- [x] Add serde derives to all recipe types in `src/recipe.rs`
- [x] Add `runtime_deps: Option<Vec<String>>` to `RecipeProcess` (JSON-only, not in binary format)
- [x] Read JSON file, deserialize via `serde_json` into `Recipe`
- [x] Encode to binary via `Recipe::encode()`
- [x] Write `.hod` to `--output` path if given
- [x] Print BLAKE3 hex hash of encoded bytes to stdout
- [x] Error handling: missing file, invalid JSON, unknown recipe type
- [x] Update all `RecipeProcess` constructions across tests to include `runtime_deps: None`
- [ ] Test: encode existing recipe JSON, verify hash matches expected

### Task 1.2: `hod decode` ✅

- [x] Add `Decode` variant to `Commands` enum
- [x] Accept `<input.hod>` positional arg, `--output <path>` optional flag
- [x] Read binary `.hod`, decode via `Recipe::decode()`
- [x] Write pretty-printed JSON to `--output` path, or stdout if omitted
- [ ] Test: round-trip an existing `.hod` through decode → encode, verify identical bytes

### Task 1.3: `hod hash-file` ✅

- [x] Add `HashFile` variant to `Commands` enum
- [x] Accept `<file>` positional arg
- [x] Read file, compute BLAKE3 hash (reuse `hash_bytes()` from `src/hash.rs`)
- [x] Print hex hash to stdout
- [ ] Test: hash a known file, verify against expected hash

## Phase 2: TypeScript SDK

### Task 2.1: Project scaffolding ✅

- [x] Create `js/` directory with `package.json` (name: `hod-sdk`)
- [x] Add `tsconfig.json` (target: Bun-appropriate settings)
- [x] Add `src/index.ts` as the public entry point
- [ ] Verify `bun run src/index.ts` works (empty export, smoke test)
- [x] Add `.gitignore` for `node_modules/`

### Task 2.2: CLI shell-out layer ✅

- [x] Create `js/src/cli.ts` with a function to invoke `hod` subcommands
- [x] Helper: `runHod(args: string[]): Promise<string>` — spawn `hod`, capture stdout, handle errors
- [x] Helper: `encode(jsonFilePath: string, outputPath?: string): Promise<string>` — returns hash
- [x] Helper: `decode(hodFilePath: string): Promise<string>` — returns JSON string
- [x] Helper: `hashFile(filePath: string): Promise<string>` — returns hex hash
- [x] Helper: `encodeJson(json: object, outputPath?: string): Promise<string>` — temp file + encode
- [x] Handle errors from `hod` (non-zero exit code, stderr messages)
- [x] Test: `js/tests/cli.test.ts`

### Task 2.3: `fileFromPath()` constructor ✅
- [x] `fileFromPath(path: string, options?: { executable?: boolean }): Promise<BuiltRecipe>`
- [x] Call `hashFile(path)` to get `content_blob_hash`
- [x] Construct JSON: `{ type: "file", content_blob_hash, executable }`
- [x] Write JSON to temp file via `encodeJson()`, get recipe hash
- [x] Return `{ hash, json }`
- [x] Test: `js/tests/recipes.test.ts`

### Task 2.4: `dep()` helper ✅

- [x] Create `js/src/dep.ts`
- [x] `dep(name: string, source: BuiltRecipe | string): ProcessDependency`
- [x] If `source` is a `BuiltRecipe`, use `source.hash`
- [x] If `source` is a 64-char hex string, use it directly as a hash
- [x] Error if string is not a valid hex hash
- [x] Return `{ name, recipe_hash }` (matching the JSON dependency format)

### Task 2.5: `process()` constructor ✅

- [x] Create `js/src/process.ts`
- [x] `process(definition: ProcessDefinition): Promise<BuiltRecipe>`
- [x] Accept: `platform`, `command`, `args`, `env`, `dependencies`, `runtime_deps?`, `unsafe_flags?`
- [x] Accept `env` as either `Record<string, string>` or `{ key, value }[]` — convert to sorted `{ key, value }[]`
- [x] Accept `dependencies` as `ProcessDependency[]` (output of `dep()`)
- [x] Sort `env` by key, sort `dependencies` by name (must be deterministic)
- [x] Construct JSON, write to temp file, call `encodeJson()` to get recipe hash
- [x] Return `{ hash, json }`
- [x] Test: `js/tests/recipes.test.ts`

### Task 2.6: Output helpers ✅

- [x] Create `js/src/output.ts`
- [x] `writeHod(recipe: BuiltRecipe, outputPath: string): Promise<string>` — write `.hod` binary to disk
- [x] `writeJson(recipe: BuiltRecipe, outputPath: string): Promise<string>` — write pretty-printed JSON to disk
- [x] Both return the hash
- [x] Test: `js/tests/recipes.test.ts`

### Task 2.7: Import helpers ✅

- [x] Create `js/src/import.ts`
- [x] `fromHod(path: string): Promise<BuiltRecipe>` — decode `.hod` → JSON, hash-file to get hash
- [x] `fromJson(path: string): Promise<BuiltRecipe>` — read JSON file, encode to get hash
- [x] Test: `js/tests/recipes.test.ts`

### Task 2.8: `download()` constructor ✅

- [x] Create `js/src/download.ts`
- [x] `download(options: { url, hash }): Promise<BuiltRecipe>` — creates a Download recipe
- [x] Validates hash is 64-char hex
- [x] Constructs JSON: `{ type: "download", url, hash_algorithm: "blake3", expected_hash }`
- [x] Shells out to `encodeJson()` to get recipe hash
- [x] Re-exported from `js/src/index.ts`
- [x] Test: `js/tests/recipes.test.ts` (3 tests: creation, round-trip, validation)

### Task 2.9: Wire up public API ✅

- [x] `js/src/index.ts` re-exports everything: `process`, `fileFromPath`, `dep`, `download`, `writeHod`, `writeJson`, `fromHod`, `fromJson`, all types
- [x] Verified: consumers can `import { process, dep, download, writeHod } from "../../js/src/index.js"`
- [x] `cbonsai.ts` uses the full API successfully

## Phase 3: Proof of Concept

### Task 3.1: Convert one recipe to TypeScript ✅

- [x] Pick a simple recipe (`recipes/cross/glibc.json` — a Process recipe with 5 deps, 3 env vars)
- [x] Create the `.ts` file alongside the existing `.json` (`recipes/cross/glibc.ts`)
- [x] Run it with `bun`, verify it produces bit-identical `.hod` output
- [x] Document any friction points or missing helpers

### Task 3.2: cbonsai.ts — second proof of concept ✅

- [x] Create `recipes/native/cbonsai/cbonsai.ts`
- [x] Uses `download()` for the source recipe (no more hand-written JSON needed)
- [x] Uses `fromJson()` for ncurses and seed dependencies
- [x] Uses `process()` + `dep()` for the cbonsai build recipe
- [x] Writes `.hod` and `.json` output files
- [x] Verifies hash matches the hand-written `cbonsai.json` (`2a6cc731...`)
- [x] Produced `.hod` is **bit-identical** to the hand-written `cbonsai.hod`

### Task 3.3: Fix and iterate

- [x] Address any issues found during conversion
  - Deps with unsupported recipe types (e.g., `unpack`) can now use `fromJson()` since `Unpack` is supported
  - Paths use `import.meta.dir` for portability (not relative to CWD)
  - `download()` constructor eliminates the need for hand-written download JSON files
- [x] Add convenience helpers: `download()` constructor added
- [ ] Update design doc if any decisions change based on experience
