# Build Environment and Metadata Design

Status: core build-environment cleanup implemented; deterministic declared metadata remains future work.

## Goals

Hod should be a small, deterministic, content-addressed build substrate. It
should be equally suitable for C/C++, Rust, Go, WebAssembly, language runtimes,
image builders, and future ecosystems. Core Rust code should therefore avoid
embedding package-ecosystem policy such as C header search paths or linker
variables.

The higher-level TypeScript SDK and recipe helpers provide ergonomic build
profiles on top of this substrate.

## Core responsibilities

Core Hod is responsible for:

- deterministic recipe encoding and hashing;
- content-addressed recipe/output storage;
- dependency graph execution;
- sandbox setup and dependency mounts;
- universal builder variables;
- generic declared metadata storage/introspection;
- platform-specific artifact fixups only when explicitly requested by recipe
  fields such as `runtime_deps`.

Core Hod is not responsible for:

- discovering C headers or libraries;
- setting `C_INCLUDE_PATH`, `LIBRARY_PATH`, `PKG_CONFIG_PATH`, `CFLAGS`,
  `LDFLAGS`, or similar ecosystem-specific variables;
- knowing that `include/`, `lib/`, or `bin/` have C/C++ semantics;
- applying Rust, Go, Python, Node, Wasm, or other ecosystem conventions.

## Process build environment

The target rule is that a Process build receives only universal environment
from core Hod:

- `OUT`
- `DEPS`
- `TMPDIR`
- `HOME`
- `HOD_STORE`

All other variables must come from the recipe, usually through SDK helpers or
recipe-local profile helpers.

This replaces the old core auto-env behavior, where the Rust builder scanned
named dependency outputs and populated:

- `PATH` from dependency `bin/` directories;
- `LIBRARY_PATH` from dependency `lib/` directories;
- `C_INCLUDE_PATH` from dependency `include/` directories.

That behavior was convenient, but it made C-oriented policy implicit in core
Hod and allowed unrelated dependency additions to change compiler/linker search
behavior. The replacement is explicit SDK-level environment composition.

## SDK dependency path helpers

The SDK should provide small, general-purpose helpers for composing sandbox
paths from dependency names. These helpers are not tied to C/C++.

Examples:

```ts
depPath("zlib")                    // /deps/zlib
depSubpath("zlib", "include")     // /deps/zlib/include
pathList(["/a", "/b"])            // /a:/b
depSubpathList(["zlib", "ssl"], "lib")
```

Ordering is caller-specified. This makes path precedence explicit in the recipe
or profile that requests it.

## Profiles and ecosystem policy

Build profiles live above core Hod. For example, a C profile may set:

- `PATH`
- `CC`, `AR`, `RANLIB`, `STRIP`
- `CFLAGS`, `LDFLAGS`
- `C_INCLUDE_PATH`
- `LIBRARY_PATH`
- `PKG_CONFIG_PATH`

But this logic belongs in TypeScript helpers such as `recipes/helpers/c.ts`, not
in `src/build.rs`.

Profiles should consume explicit dependency lists instead of all declared deps
by default. For example:

```ts
cProfile({
  toolchain: "toolchain",
  binDeps: ["pkgconf"],
  includeDeps: ["zlib", "ncurses"],
  libDeps: ["zlib", "ncurses"],
  pkgConfigDeps: ["zlib"],
})
```

Package-specific layout quirks remain explicit:

```ts
cProfile({
  includePaths: [depSubpath("ncurses", "include/ncursesw")],
})
```

Later, declared metadata can make these quirks reusable without putting them in
core Hod.

## Metadata direction

Hod should support declared recipe metadata as a first-class concept. Metadata
is part of a recipe's interface and should affect the recipe hash when present.
Changing declared interfaces should therefore change downstream identities in a
traceable way.

Core metadata requirements:

- deterministic encoding;
- optional and backward-compatible for existing recipes;
- opaque to core except for validation/canonicalization;
- available for SDK/helpers and CLI introspection;
- generic enough for any ecosystem.

The preferred model is recipe-declared metadata rather than build-discovered
metadata as the foundation. Build-discovered metadata may be useful later for
validation or diagnostics, but downstream builds should depend on declared,
hashed interfaces.

The core should not define C-specific fields. Instead, the SDK can define typed
conventions layered over generic metadata, such as:

```ts
{
  provides: {
    executables: ["bin"],
    ecosystems: {
      c: {
        includeDirs: ["include", "include/ncursesw"],
        libDirs: ["lib"],
        pkgConfigDirs: ["lib/pkgconfig"]
      }
    }
  }
}
```

The exact metadata wire representation should be specified before implementation
lands. The design preference is canonical deterministic data, not arbitrary
non-canonical JSON.

## Migration plan

1. ~~Add SDK path/environment helpers.~~ **DONE.**
2. ~~Refactor `cProfile()` to compose C-specific environment explicitly from
   caller-provided dependency lists.~~ **DONE.**
3. ~~Update recipes to declare the dependency paths they need through profiles.~~ **DONE.**
4. ~~Remove core auto-env from `src/build.rs`.~~ **DONE.**
5. ~~Add tests proving core no longer injects C-specific variables.~~ **DONE.**
6. Design and implement deterministic declared recipe metadata.

The core auto-env has been removed. Process builds now receive only recipe env
plus the standard universal variables (OUT, DEPS, TMPDIR, HOME, HOD_STORE).
Recipes declare their C-specific environment through `cProfile()` options
(binDeps, includeDeps, libDeps, pkgConfigDeps, includePaths, etc.).
