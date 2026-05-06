**ARCHIVED:** This plan is superseded by `plans/bootstrap-roadmap.md` (the single source of truth). This file is kept for historical reference only.

# Bootstrap Executor: Options for Eliminating Seed from User Recipes

**Status:** Decision pending — written for second-opinion review  
**Author's lean:** Option 1  
**Context:** Hod is a content-addressed build system. We have a bootstrap chain that builds a glibc-hosted native GCC toolchain, and have successfully migrated `ncurses` and `cbonsai` to use it. But user recipes still declare the bootstrap seed as a dependency because the build executor (the shell that runs build scripts inside the sandbox) is seed's `busybox`.

## Current State

Every recipe's `Process` definition has a `command` + `args` that Hod launches inside the sandbox. Today all recipes use:

```ts
command: "/deps/seed/bin/busybox",
args: ["sh", "-c", `<build script>`],
dependencies: [
  dep("seed", seedRootRecipe),   // provides busybox + musl linker
  dep("toolchain", nativeToolchainRecipe),  // provides gcc, glibc, sysroot
  ...
]
```

The build script itself uses the native toolchain for compilation (gcc, binutils, glibc sysroot). Seed's role is:

1.  **Executor:** `busybox sh -c "..."` — the process that runs the build script
2.  **Shebang handler:** `/bin/sh → busybox` (created by preamble)
3.  **Musl dynamic linker:** busybox is dynamically linked against musl, so `/lib/ld-musl-x86_64.so.1` must exist before glibc runtime is set up

The native toolchain already contains Hod-built `bash`, `coreutils`, `make`, `sed`, `grep`, and more — all glibc-linked. It does **not** contain a statically-linked shell, which is why we still need seed's busybox.

## The Goal

User-facing recipes (ncurses, cbonsai, and all future packages) should **not** declare seed as a dependency. Seed should exist only in the transitive historical bootstrap chain, invisible to users. The native toolchain should be self-bootstrapping: it provides everything a build script needs to execute.

## The Chicken-and-Egg

Why can't we just use the toolchain's bash as executor?

```
command: "/deps/toolchain/bin/bash"
```

Bash is **dynamically linked against glibc**. When Hod spawns it in the sandbox, the kernel tries to load its ELF interpreter — `/lib64/ld-linux-x86-64.so.2` — which hasn't been set up yet. The preamble (which creates `/lib64/ld-linux-x86-64.so.2` and symlinks `libc.so.6`) runs *inside* the shell, so it runs *after* the shell starts. Deadlock.

A **statically-linked** shell has no ELF interpreter — the kernel loads it directly, no runtime setup needed. That's the key.

---

## Option 1: Add a statically-linked busybox to the native toolchain

**What:** Build busybox from source using `gcc-stage2`, statically linked against glibc. Bundle it in the native toolchain. User recipes then use it as the executor.

```ts
command: "/deps/toolchain/bin/busybox",
args: ["sh", "-c", "..."],
dependencies: [
  dep("toolchain", nativeToolchainRecipe),
  dep("source", ...),
  // no seed
],
```

**Implementation:**
- New recipe: `recipes/toolchain/busybox-native.ts` — downloads busybox source, compiles with `gcc-stage2 --static`, produces `bin/busybox`
- Update `native-toolchain.ts` to include this busybox in the bundle
- Update preamble: `shell: "toolchain"`, remove `muslLinker` (nothing in user recipes is musl-linked)
- Update ncurses/cbonsai recipes: change `command` to `/deps/toolchain/bin/busybox`, drop seed dep

**Pros:**
- Directly solves the problem. User recipes have zero seed dependency.
- Static binary — no runtime setup needed, always works.
- Toolchain becomes truly self-bootstrapping for all future recipes.
- No changes to Hod's core (sandbox, store, build engine). All work is in recipes + preamble.
- Minimal: roughly one new recipe, small changes to 3–4 existing files.

**Cons:**
- Static linking means busybox is larger (~2-3MB vs ~1MB dynamic) and can't benefit from libc security updates. (Mitigated by the content-addressed model — a rebuild gets the latest libc.)
- Busybox's `sh` is ash, not bash. Some configure scripts need bash. We already have bash in the toolchain, but it's dynamically linked. A second static binary (static bash) would solve that if ever needed.
- Still hardcodes `busybox sh` as the universal executor. If a future recipe genuinely needs a different executor (e.g., Python), the recipe author must still decide whether to use busybox's `sh` as a wrapper or change `command`.

---

## Option 2: Automatically mount the executor's transitive dependency closure

**What:** Change Hod's build engine so that when a recipe specifies `command: "/deps/bash/bin/bash"`, Hod automatically walks bash's transitive dependencies, determines everything it needs at runtime (glibc, dynamic linker), and mounts them in the sandbox — even if the recipe didn't declare them as deps.

**Implementation:**
- New store query: given an output hash, traverse its recipe's `dependencies` recursively to find the full transitive closure.
- During sandbox setup, mount all transitive deps, not just direct deps.
- The preamble might become unnecessary — the dynamic linker and libc would be present automatically.

**Pros:**
- Conceptually clean — the builder "just works" without the recipe author thinking about runtime deps.
- Mirrors Nix's approach: the builder's entire runtime closure is available in the sandbox.
- Recipe files become simpler — no preamble, no `glibcLinker`/`muslLinker` config.

**Cons:**
- **Major architectural change.** Hod currently has no concept of transitive closure queries. Adding one requires a new store API, recursive SQL queries, and changes to recipe validation (deps are currently flat lists, sorted for deterministic encoding).
- **Implicit behavior.** The recipe says `deps: [bash]`, but the sandbox silently gets bash, glibc, gcc-stage2, linux-headers, and everything those depend on. This violates the explicit-dependency contract that content-addressed builds rely on.
- **Performance.** Transitive closure computation is O(deps × depth). For deep bootstrap chains, this could be slow.
- **Silent breakage.** If a transitive dep changes, Hod would need to detect that the builder's runtime environment changed and invalidate caches — but the recipe hash wouldn't change (deps are the same). This creates a cache-invalidation problem.
- The seed dependency still exists (as a transitive dep of gcc-stage1 → gcc-stage2 → bash), but it's now invisible to the recipe author, which is arguably *less* transparent than Option 1's explicit removal.

---

## Option 3: Split dependencies into build-time and runtime

**What:** Add a second dependencies array to recipes, distinguishing between "mounted during build" (build deps) and "needed by the output" (runtime deps). Analogous to Nix's `nativeBuildInputs` vs `buildInputs`.

```ts
buildDeps: [dep("seed", seedRootRecipe)],    // executor + musl linker
deps: [dep("toolchain", nativeToolchainRecipe)], // compiler for output
```

**Implementation:**
- Extend the Process recipe format with a `build_deps` field (or similar).
- During sandbox setup, mount both `buildDeps` and `deps`.
- Auto-env (PATH, LIBRARY_PATH, C_INCLUDE_PATH) could treat them differently — e.g., build deps don't contribute to LIBRARY_PATH.
- The preamble uses build deps for shell/linker, regular deps for compilation.

**Pros:**
- Makes the build-time vs runtime distinction explicit. The recipe author declares what's scaffolding vs what's substance.
- Doesn't require transitive closure computation (Option 2's main cost).
- Could be useful beyond this specific problem — e.g., test frameworks needed during `make check` but not in the output.

**Cons:**
- **Recipe format change.** Adds a new field to the binary recipe format. Requires careful backward-compatibility handling.
- **Conflates two concerns.** "Build-time" currently means two different things: (a) the executor/shell, which is a sandbox scaffolding concern; and (b) build tools needed during compilation but not at runtime (like `make`, `pkg-config`). These have different semantics and might need different treatment.
- **Doesn't eliminate seed.** Seed is still an explicit build dep. The goal was to make user recipes not reference seed at all — this option just moves the reference to a different field.
- **Increases recipe complexity.** Recipe authors must now think about two dep categories. The "correct" split isn't always obvious (is `pkg-config` build-time or runtime? What about `gcc`?).
- Could be combined with Option 1 (static busybox eliminates the need for a seed build dep) but then the `buildDeps` field might be solving a different problem than the one we have.

---

## Comparison Matrix

| Criterion | Option 1 (static busybox) | Option 2 (transitive closure) | Option 3 (split deps) |
|-----------|--------------------------|-------------------------------|----------------------|
| Eliminates seed from user recipes | ✅ Yes | ❌ No (still transitive) | ❌ No (different field) |
| Changes to Hod core | None | **Major** (store, sandbox, cache invalidation) | Moderate (recipe format, sandbox) |
| Changes to recipes/SDK | ~4 files, ~1 new recipe | Many recipes (preamble simplified) | All recipes (new field) |
| Explicit vs implicit deps | Explicit (toolchain provides everything) | Implicit (mounts undeclared deps) | Explicit (but new field) |
| Solves general problem | Solves *this* problem specifically | Solves a broader class of problems | Partially solves, creates new questions |
| Risk | Low — local changes, well-understood | High — architectural, cache bugs likely | Medium — format stability concerns |

---

## Recommendation (author's lean)

**Option 1.** It is the minimal change that achieves the stated goal: user recipes never reference seed. The other options solve broader problems but introduce architectural risk and complexity disproportionate to the actual need. Option 1 can be implemented in a few hours with local changes.

If future recipes genuinely need a different executor (e.g., a Python-based build), that can be handled case-by-case. The `command` field already supports it. A `shellBuild()` helper in the SDK can hide the common-case boilerplate.

Options 2 and 3 are worth revisiting if we discover that multiple executor types are needed across many recipes. But for now, "every recipe is a shell script" covers 100% of existing recipes and the foreseeable future, and Option 1 makes that work without seed.
