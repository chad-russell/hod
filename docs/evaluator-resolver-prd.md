# Hod Evaluator & Resolver — PRD

**Date:** 2026-05-01
**Status:** Deferred design / not implemented
**Author:** Design session

> Current status: this resolver/path-reference design is not implemented in this checkout. The near-term recipe authoring path is the single-phase TypeScript SDK in [`recipe-compiler-guide.md`](recipe-compiler-guide.md), which computes concrete dependency hashes up front via TS imports and `hod encode`. `hod build` currently accepts only concrete hash dependencies, and there is no `hod resolve` command.

---

## 1. Vision

Extend Hod with an evaluation and resolution layer that separates source .hod files (which may contain symbolic path references to other .hod files) from resolved .hod files (which contain only concrete BLAKE3 hashes). The resolver is the bridge: it crawls a tree of source .hod files bottom-up, converts symbolic refs into concrete hashes, and writes fully resolved .hod files into the store — at which point `hod build` operates exactly as it does today.

Multi-language libraries (TypeScript, Rust, a custom DSL, etc.) produce source .hod files. The resolver is language-agnostic: it operates exclusively on .hod files. This preserves the fundamental architecture of Hod — the builder sees only `hod build`, and the evaluator/compiler sees only `.hod` files → `hod resolve`.

### Design Principles (inherited from V1)

1. **Reproducibility.** Same resolved .hod hash → same output hash. Always.
2. **Performance.** Resolution is a lightweight crawl, not a live object graph. Caching can be added incrementally.
3. **Rigor.** Source and resolved .hod files share the same binary format; the only difference is the tag byte in dependency references.
4. **Separation of concerns.** The resolver is a standalone CLI tool that consumes .hod files and produces .hod files. It knows nothing about building, sandboxing, or execution.

---

## 2. Architecture

```
 ┌───────────────┐
 │  Language     │  TypeScript, Rust, Go, a DSL compiler, etc.
 │  Libraries    │  Each produces .hod files with symbolic refs.
 └───────┬───────┘
         │  source .hod files (may contain path refs)
         ▼
 ┌───────────────┐       ┌──────────────────┐       ┌─────────────┐
 │  hod resolve  │──────▶│ resolved .hod    │──────▶│  hod build  │
 │  (resolver)   │       │ (concrete only)  │       │  (builder)  │
 └───────────────┘       └──────────────────┘       └──────┬──────┘
                                                           │
                                                    ┌──────▼──────┐
                                                    │    Store     │
                                                    │ SQLite + FS  │
                                                    └─────────────┘
```

**Four layers:**

1. **Language libraries** (plural): Ergonomic ways to author recipes in your language of choice. Each emits .hod binary files. These are thin wrappers — their value is convenience (type-safe builders, helper functions, derive macros), not architecture.
2. **Source .hod files**: Binary .hod files on disk, possibly containing path-based dependency references. These are the "source representation" — what lives in a package's version control.
3. **`hod resolve`**: Reads source .hod files, follows path refs recursively, computes resolved hashes, writes fully concrete .hod files into the store. This is the equivalent of Nix's `nix-instantiate`.
4. **`hod build`** (unchanged from V1): Reads resolved .hod files, resolves the DAG, builds in sandboxes, stores outputs.

---

## 3. Dependency Reference Types

### 3.1 Current format (V1)

A `ProcessDependency` is encoded as:

```
name_len: u16 LE | name bytes | recipe_hash: [u8; 32]
```

All dependencies are concrete BLAKE3 hashes. A .hod file is only buildable if every dependency reference is a hash.

### 3.2 Extended format (V2)

A `ProcessDependency` gains a tagged union for its reference:

```
name_len: u16 LE | name bytes | ref_tag: u8 | payload
```

| ref_tag | Type | Payload | Description |
|---------|------|---------|-------------|
| `0x00` | Hash | `recipe_hash: [u8; 32]` | Concrete reference. The .hod file is buildable. |
| `0x01` | Path | `path_len: u16 LE | path: [u8]` | Source reference. A relative or absolute filesystem path to another .hod file. Must be resolved before building. |

Tags `0x02`–`0xFF` are reserved for future extension (e.g., name/constraint references resolved against a registry).

### 3.3 Path resolution rules

- **Relative paths** are resolved relative to the directory containing the .hod file making the reference.
- **Absolute paths** are used as-is.
- Paths must point to a `.hod` file. Directories, non-.hod files, and missing files are errors.
- Symlinks are followed. Paths are normalized (`.` and `..` resolved) before use.

### 3.4 Encoding

The `ref_tag` byte acts as the discriminant. The encoder writes:

```
For Hash refs (0x00):
  u8(0x00)
  hash(&recipe_hash)

For Path refs (0x01):
  u8(0x01)
  str_u16(&path)
```

This pattern is already used in the encoding layer: the `optional()` helper writes a presence byte followed by conditional data. A similar `enum_tag()` helper can be added to `encoding.rs`.

### 3.5 Deterministic encoding

- Dependencies remain sorted by name, regardless of ref type.
- For a given dependency, the ref type and payload are part of the recipe bytes — so the .hod file's hash covers which ref type is used.
- A source .hod (with path refs) and its resolved counterpart (with hash refs) have *different hashes* — they are different files with different identities. This is by design.

### 3.6 Validation

- A .hod file with *any* path refs (`ref_tag = 0x01`) is a **source .hod** and cannot be passed to `hod build`. The builder rejects it with an explicit error.
- A .hod file with only hash refs (`ref_tag = 0x00`) is a **resolved .hod** and is buildable.
- `hod resolve` is the only tool that accepts source .hod files.

---

## 4. The Resolver (`hod resolve`)

### 4.1 Core algorithm

```
hod resolve <source-file.hod> [--output <path>]
```

1. **Read** the source .hod file.
2. **Identify** all dependencies with `ref_tag = 0x01` (path refs).
3. **Recurse**: for each path ref, resolve the target .hod file at that path (which may itself contain path refs).
4. **Compute leaf hashes first**: recursively resolved .hod files have their concrete hashes computed. This is the bottom-up crawl.
5. **Replace** each path ref with the now-known concrete hash (set `ref_tag = 0x00`, write the resolved recipe hash).
6. **Store** the fully resolved .hod file in the store (at its resolved hash).
7. **Report** the resolved hash to stdout.

### 4.2 Output

By default, resolved .hod files are written to the store. An `--output <path>` flag writes to a user-specified path instead (or additionally).

A `--dry-run` flag prints the resolved hash without writing anything, useful for CI verification.

The resolved hash is printed to stdout for scripting:

```bash
$ hod resolve recipes/gcc/03-gcc.hod
f3a1b9c2...   # hex-encoded BLAKE3 hash of the resolved .hod
```

### 4.3 Store integration

When written to the store, resolved .hod files are stored in the existing `recipes/` directory (sharded by first two hex chars of the hash), and registered in the `recipes` SQLite table — exactly as if they had been imported directly. `hod build` can then resolve them from the store without needing the source file.

### 4.4 Error handling

| Condition | Error |
|-----------|-------|
| Path ref points to a file that doesn't exist | Resolution error: file not found |
| Path ref points to a non-.hod file | Resolution error: not a .hod file |
| Cyclic path references (A → B → A) | Resolution error: cycle detected |
| .hod file has an unsupported ref_tag (≥ 0x02) | Format error: unknown ref tag |

### 4.5 Caching (deferred to v2)

A mapping from source .hod hash → resolved .hod hash can be stored in the SQLite database (new table `resolution_cache`). On subsequent resolves, if the source .hod hash hasn't changed and a cached resolved hash exists, the crawl can short-circuit. This is a performance optimization that does not change the semantics of resolution. Deliberately deferred to keep the MVP minimal.

---

## 5. Language Libraries

### 5.1 Role

Language libraries are not part of the `hod` binary. They are separate packages that produce .hod files. Their value proposition:

- **Type-safe builders** for recipe construction (e.g., `ProcessRecipe::new()` with required fields enforced at compile time)
- **Symbolic dependency references** — a library can emit a path ref without needing to know the target's hash
- **Helper functions** for common patterns (e.g., `withStandardWrappers()`, `addBuildScript(path)`)
- **Convenience** — nobody should have to hand-write JSON or binary .hod files for non-trivial packages

### 5.2 Target languages

| Language | Rationale |
|----------|-----------|
| **TypeScript/JavaScript** | Largest ecosystem; brioche precedent; npm/pnpm distribution |
| **Rust** | Hod itself is Rust; natural fit for Rust projects building with Hod |
| **Go** | Simple toolchain, static binaries, popular for infra |
| **A custom DSL** | A non-Turing-complete language for package definitions, compiled to .hod (future) |

### 5.3 Interface contract

Every language library must produce valid .hod binary files conforming to the format spec. They may produce either:

- **Source .hod files** (with path refs), to be run through `hod resolve`, or
- **Resolved .hod files** (with concrete hashes), if the library can resolve hashes internally (e.g., by calling `hod resolve` as a subprocess or using a native Rust binding).

### 5.4 Example: TypeScript library

```typescript
import { Process, File, dep } from "@hod/sdk";

const buildScript = File.fromPath("./build-gcc.sh", { executable: true });

const gcc = new Process({
  command: "/bin/bash",
  args: ["/deps/build-script/data"],
  env: { CC: "/deps/seed/bin/gcc", PATH: "/deps/seed/bin" },
  deps: [
    dep("seed"),           // path ref → ./seed/seed.hod or hash ref if known
    dep("glibc"),          // path ref → ../glibc/05-glibc.hod
    dep("build-script", buildScript.hash()),
  ],
});

gcc.write("./03-gcc.hod");
```

The library can be as thin as a JSON serializer with a friendly API, or as sophisticated as a full dependency graph builder. The important thing is that the output is always a `.hod` file.

---

## 6. Package Distribution & Registries

### 6.1 What gets published

A package publishes its **resolved .hod files** — the fully concrete ones. These contain only hash references. They are content-addressed and immutable.

Dep hashes in a published .hod file are pointers into the global content-addressed store. The publisher does *not* need to ship transitive dependencies — only the top-level .hod files for their package.

### 6.2 How consumers get missing deps

When `hod build` encounters a recipe hash that isn't in the local store:

1. **Check the recipe store**: is the .hod file present?
2. **If not**: fetch it from a substituter / registry (V2 feature — not in this PRD scope, but designed for).
3. **Recursively** fetch transitive deps as needed.

This is exactly the Nix substituter model. The .hod file is the contract; the registry is just a content-addressed blob store for .hod files (and eventually build outputs).

### 6.3 No live dependency resolution at build time

Dependency resolution happens at `hod resolve` time, not `hod build` time. The builder never needs to interpret path refs, follow symbolic names, or contact a registry to figure out what to build. It only sees concrete hashes. This is the fundamental guarantee that keeps the builder simple and deterministic.

---

## 7. CLI Interface

### 7.1 `hod resolve`

```
hod resolve <source-file.hod> [flags]
```

Flags:
- `--store <path>`: Override store location (for writing resolved recipes)
- `--output <path>`: Write resolved .hod to a specific path (in addition to or instead of the store)
- `--dry-run`: Resolve and print the hash, but don't write anything
- `--verbose`: Print resolution steps (which files are being crawled, what hashes are computed)

Exit codes:

| Code | Meaning |
|------|---------|
| 0 | Resolution succeeded |
| 1 | Source .hod file not found or unreadable |
| 2 | Path ref points to a non-existent file |
| 3 | Cycle detected in path references |
| 4 | Unknown ref tag in dependency |
| 10 | Store error |

### 7.2 `hod build` (modified)

The builder gains a new validation check:

- If any dependency has `ref_tag != 0x00`, reject with: `"Unresolved dependency '<name>': run 'hod resolve' first"`

This is an explicit, early error with a clear message. The builder never silently builds an incomplete recipe.

---

## 8. Format Versioning

### 8.1 Version bump

The existing format version (`VERSION = 0x00`) remains for the current format. The extended dependency format with `ref_tag` is a new version (`VERSION = 0x01`). This ensures:

- V0 .hod files (all deps are implicitly hash refs) continue to work without modification.
- V1 .hod files (with explicit ref tags) are parsed with the new codec.
- Old builders that don't understand V1 reject the file with an "unsupported version" error.

### 8.2 Migration path

All existing .hod files and recipes (the hermetic toolchain packages) are already fully concrete — they use only hash refs. These remain valid V0 files with no changes needed.

**Converters** (`hod encode`/`hod decode`) can read V0 and produce V1 (adding `ref_tag = 0x00` to each dep) or vice versa (stripping ref_tag bytes when all are 0x00). V0 files have different hashes than their V1 equivalents, because the ref_tag byte is part of the encoded body — this is expected and correct.

Sending a V1 file with path refs through a V0 decoder produces an "unsupported version" error — old tooling explicitly rejects what it doesn't understand.

---

## 9. Example: End-to-End Workflow

### 9.1 Authoring (TypeScript)

```typescript
// my-project/recipes/gcc/build-gcc.ts
import { Process, File, depRef } from "@hod/sdk";

const buildScript = File.fromPath("./build-gcc.sh", { executable: true });

const gcc = new Process({
  command: "/bin/bash",
  args: ["/deps/build-script/data"],
  deps: [
    depRef("build-script", buildScript),
    depRef("glibc", "../glibc/05-glibc.hod"),     // path ref
    depRef("seed", "../../seed/seed.hod"),          // path ref
  ],
});

gcc.write("./03-gcc.hod");
```

### 9.2 Resolving

```bash
$ hod resolve my-project/recipes/gcc/03-gcc.hod

# Resolution crawl (verbose):
#   Read 03-gcc.hod
#   Resolving path ref: ../glibc/05-glibc.hod
#     Read 05-glibc.hod
#     Resolving path ref: ../../seed/seed.hod
#       Read seed.hod (no path refs — leaf)
#       Resolved hash: 154322b0...
#     Resolved hash: db6a1acd...
#   Resolved 03-gcc.hod → f3a1b9c2...

f3a1b9c2d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0
```

### 9.3 Building

```bash
$ hod build f3a1b9c2...

# OR, if the resolved .hod was written to a file:
$ hod build ./resolved/03-gcc.hod
```

### 9.4 Publishing

The CI pipeline runs `hod resolve` on the package's entry points and uploads the resolved .hod files to a registry. Consumers fetch them by hash.

---

## 10. Out of Scope

| Feature | Target | Rationale |
|---------|--------|-----------|
| Source-hash → resolved-hash caching | v2 | Performance optimization; doesn't affect correctness |
| Name/constraint refs (ref_tag 0x02+) | v2+ | Requires registry infrastructure |
| Substituter / remote store fetch | v2 | Builder-side feature; orthogonal to resolution |
| Language libraries (TS, Rust, Go) | Separate projects | Not part of the `hod` binary; community/ecosystem |
| Custom DSL compiler | Future | Depends on language library maturity |
| Incremental resolution (watch mode) | v3 | Requires caching layer |
| Cross-package resolution (monorepo with multiple workspaces) | v2 | Path refs can span directories; workspace config deferred |

---

## 11. Success Criteria

The resolver MVP is successful when:

1. **Deterministic**: `hod resolve` on the same source .hod tree always produces the same resolved hash.
2. **Composable**: A resolved .hod produced by `hod resolve` is identical (binary-identical, same hash) to one produced by a language library that hashes internally — the format is the contract.
3. **Idempotent**: Resolving an already-resolved .hod (all hash refs) is a no-op that returns the same file.
4. **Error-clear**: Path ref errors (missing file, cycle, unknown tag) produce specific, actionable error messages.
5. **Backward-compatible**: Existing V0 .hod files (concrete hashes only) work with both the old builder and the new resolver without modification.
