# AGENTS.md - Hod

This file is the **agent/LLM quick-start**. `README.md` is human-oriented; this file is optimized for fast, accurate repo entry.

## Read order

1. `README.md`
2. `docs/README.md`
3. the relevant Rust/TS modules for your task
4. `plans/README.md` only after you know whether a plan is active or historical

## Ground truth

- **TypeScript recipes are the source of truth.** Authoritative recipes live in `recipes/**/*.ts`.
- **`.hod` files are not the normal workflow.** They are for import/export/debugging.
- **There is no top-level `PRD.md`.** Do not add new references to it.
- **Current behavior lives in `docs/`, source, and tests.** `plans/` contains design history and active planning notes, but many files there are historical.
- **Some ignored tests and old notes still mention historical checked-in `.hod` recipes.** Treat those as historical unless you confirm the current code path still uses them.

## High-signal repo map

```text
src/
  main.rs          CLI entry point and subcommand dispatch
  recipe.rs        recipe types + deterministic binary encoding/decoding
  build.rs         DAG resolution, caching, builders, runtime fixups
  sandbox.rs       Linux sandbox setup for Process recipes
  packed.rs        ELF RUNPATH patching + AT_EXECFN bootstrap injection
  relocate.rs      store-relative runtime relocation for Process outputs
  wrap.rs          post-build wrapper generation for GUI/runtime env setup
  closure.rs       `hod closure` / `hod copy-closure`
  run.rs           `hod run` / `hod shell`
  profile.rs       `hod profile` symlink farms + env snippets
  store.rs         store facade (SQLite + filesystem)

js/src/
  index.ts         SDK exports
  process.ts       Process recipe construction
  shell.ts         shellBuild helper
  env.ts           dependency path/env helpers
  import.ts        `fromHod()` / `importToStore()`

recipes/helpers/
  c.ts             C build profile helpers
  meson.ts         Meson helper layer
  rust.ts          Rust toolchain helpers + `cargoBuild`
  go.ts            Go helper layer + `goBuild`
  strip.ts         shared strip snippets

docs/
  README.md                        docs index
  agent-package-guide.md          practical package authoring guide
  bootstrap-pipeline.md           seed → toolchain → downstream pipeline
  build-environment-and-metadata.md
  closure-transfer.md
  debugging-builds.md
  profiles.md
  recipe-compiler-guide.md
  relocatable-binaries-guide.md
```

## Key current behavior

- `hod run` and `hod shell` accept either a **64-char recipe hash** or a **path to a `.ts` recipe file**.
- `hod profile activate/build` are implemented.
- Profile env scripts set **`PATH`**, **`MANPATH`**, and **`XDG_DATA_DIRS`**; they intentionally do **not** set `LD_LIBRARY_PATH`.
- `hod closure` and `hod copy-closure` are implemented; `copy-closure --from` is not.
- Process `runtime_deps` drive:
  - store-relative ELF relocation
  - AT_EXECFN bootstrap injection for executables
  - post-build wrapper generation for runtime env like `XDG_DATA_DIRS` / `GSETTINGS_SCHEMA_PATH` / `GSK_RENDERER` / `GIO_LAUNCH_DESKTOP`
- Core Rust no longer injects C/C++-specific build env automatically. Ecosystem env composition lives in TS helpers like `cProfile`, `cargoBuild`, and `goBuild`.
- `shellBuild` injects the long dummy RPATH automatically. If a recipe overrides linker flags manually, it must preserve the dummy RPATH slot.

## Debugging philosophy

When a user reports a runtime failure, always:

1. **Identify the root cause** — trace the error back to the actual missing piece (a disabled build option, a missing runtime_dep, a wrong path, etc.).
2. **Provide a quick workaround** — give the user a one-liner that works *now* (e.g. `GDK_BACKEND=x11`).
3. **Suggest the proper fix** — propose the recipe or infrastructure change that eliminates the root cause for good.

Never stop at "it works on my machine" or "try a different binary." The goal is to close the gap permanently.

## When editing docs

- Keep `README.md` human-oriented.
- Keep `AGENTS.md` agent-oriented.
- Keep `docs/README.md` as the authoritative docs index.
- Keep `plans/README.md` as the status index for plans.
- Mark plan files clearly as **active**, **implemented**, **superseded**, or **historical**.
- Separate **implemented now** from **future design**.
- Remove broken links and stale references when you find them.

## Validation

Use the Nix dev shell if tools are missing:

```bash
nix develop --accept-flake-config
```

Good default checks:

```bash
nix develop --accept-flake-config --command cargo test --no-run
nix develop --accept-flake-config --command cargo test -- --test-threads=1
```

Avoid ignored bootstrap/sandbox tests unless explicitly asked.

## Recent milestone

The current tree has crossed an important portability milestone:

- build **Nautilus 48.7** from source
- copy its closure to another machine (NixOS + niri)
- run it there — window rendering, schema resolution, and "Open With" app launching all work

This means closure transfer + relocation + wrapper/runtime setup are now good enough for a complex GTK4/libadwaita GUI app with a deep dependency tree.

Additionally, the COSMIC desktop environment build is nearly complete:

- **18 of 19** COSMIC components build from source (8 core + 10 supporting + pop-launcher + cosmic-icons)
- Full dependency chain: Mesa → eudev/libinput/seatd → PulseAudio/pipewire → cosmic-comp → all apps
- Ready to proceed to Phase 5 (bootable VM image) with the 18 working components

## Likely next fronts

1. **COSMIC desktop environment** (`plans/cosmic-desktop-roadmap.md`) — build the full COSMIC DE from source: Mesa → C deps → Rust apps → bootable VM. This is the top priority.
   - **18/19 components build.** Only xdg-desktop-portal-cosmic remains blocked on pipewire-sys bindgen.
   - Phase 5 (VM image) can proceed with the 18 working components.
2. enable Vulkan/GL in GTK4 build to eliminate `GSK_RENDERER=cairo` workaround
3. pre-generate pipewire-sys bindings to unblock xdg-desktop-portal-cosmic
4. improve multi-machine / binary-cache workflows (`copy-closure --from`, pull flows)
5. reduce bootstrap trust surface (seed minimization)
