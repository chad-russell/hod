# Plan: Declarative Runtime Metadata + Generic Wrapper Mechanism

**Status:** Active — Steps 1–3 implemented; Step 4 in progress. The `wrapper`
facet (`file`) is **verified end-to-end on a full from-source toolchain
bootstrap** (gcc/glibc), and the cross-recipe `provides` facet (xkeyboard-config
→ consumer) is **verified end-to-end** (then reverted — see finding). Launcher
provisioning settled on **Model B (build-system infrastructure)**, not a recipe
dependency. **Key finding:** the launcher path is all-or-nothing per output, so
the next required step is the **generic base in `composer.rs`**, after which
consumers migrate atomically. Remaining: generic base, per-consumer migration,
delete shell-wrapper generator.
**Supersedes the ad hoc policy in:** `src/wrap.rs`
**Related docs:** `docs/build-environment-and-metadata.md`,
`docs/relocatable-binaries-guide.md` §7 (Layer 6)

## Problem

`src/wrap.rs` generates POSIX-shell wrapper scripts for built executables and,
in doing so, hardcodes a large pile of package-ecosystem policy in core Rust:

- **Capability detection → env var.** Probes dep/own staging dirs for magic
  paths and sets env accordingly: `GIO_LAUNCH_DESKTOP`, `XKB_CONFIG_ROOT`,
  `XLOCALEDIR`, `LIBGL_DRIVERS_PATH`, `__EGL_VENDOR_LIBRARY_DIRS`, `MAGIC`,
  `GSK_RENDERER`/`GIO_EXTRA_MODULES` (GTK4 sniff via `libgtk-4.so`),
  `GHOSTTY_RESOURCES_DIR`, `GIT_EXEC_PATH`/`GIT_TEMPLATE_DIR`,
  `XDG_DATA_DIRS`, `GSETTINGS_SCHEMA_PATH`.
- **argv/exec-line quirks.** git alias translation (`git-upload-pack` →
  `git upload-pack`), alacritty `--option env.LD_LIBRARY_PATH=""`, ghostty-bin
  explicit `ld-linux --library-path` invocation.
- **Skip-lists.** wrap-everything-then-blocklist `clang`/`gcc`/`cmake`/static
  ELFs/etc., plus a ghostty shell-launcher special case.
- **`LD_LIBRARY_PATH` policy.** Name-matched allowlist (`alacritty`,
  `ghostty-bin`).

This directly violates the repo's stated principle that core Rust must not
embed ecosystem policy (`docs/build-environment-and-metadata.md`). The heavy
knowledge also lives **only** in `wrap.rs`: `run.rs` and `profile.rs` do plain
`XDG_DATA_DIRS` composition, so apps launched via `hod run` / a profile miss
all of it (e.g. a GTK4 app gets no `GSK_RENDERER`).

## Design principles (confirmed)

1. **Policy → recipe-declared, hashed metadata. Mechanism → generic core.**
   This mirrors nixpkgs exactly: the wrapper machinery (`makeWrapper` /
   `makeBinaryWrapper`) is dumb; the knowledge lives in per-dependency setup
   hooks (`glib`, `gobject-introspection`, `hicolor-icon-theme`, …) and
   `wrapGAppsHook` just aggregates what they contributed.
2. **Provider-declared, not app-declared.** Each *dependency* declares the
   runtime env it contributes ("if you runtime-depend on me, here's my env").
   Core aggregates over `runtime_deps`. App recipes stay clean and things
   "just work". App-level overrides/additions are still allowed on top.
3. **Be as "normal" / low-magic as possible.** Preserve `argv[0]` so `ps`,
   profilers, and crash reporters see the real application, not a wrapper.
4. **Hermetic + reproducible + relocatable, always.** Metadata is hashed (it
   is part of a recipe's interface); the launcher is a content-hashed hod
   recipe; manifests carry store-relative paths resolved at relocation time.

## Metadata shape

Add a `runtime` block to `RecipeProcess` (backward-compatible tail encoding,
like `runtime_deps`; absent = unchanged hash). Two facets:

- **`provides`** — env contributions offered to runtime-dependents. Examples:
  - `xkeyboard-config`: `XKB_CONFIG_ROOT = self:share/X11/xkb`
  - `glib`: `GSETTINGS_SCHEMA_PATH += self:share/glib-2.0/schemas`,
    `GIO_LAUNCH_DESKTOP = self:libexec/gio-launch-desktop`
  - `mesa`: `LIBGL_DRIVERS_PATH`, `__EGL_VENDOR_LIBRARY_DIRS`
- **`wrapper`** — directives about the output's *own* executables:
  self-referential env (`GHOSTTY_RESOURCES_DIR`, `GIT_EXEC_PATH`), flag
  injection, and `set-default`/`unset` (alacritty/ghostty `LD_LIBRARY_PATH`).

### Directive algebra (adopt nixpkgs's proven interface)

Operations: `set`, `set-default`, `unset`, `prefix ENV SEP VAL`,
`suffix ENV SEP VAL`, `add-flags`, `argv0` / `inherit-argv0`.

Value sources: `literal` | `self:<subpath>` | `dep:<name>:<subpath>` |
`first-existing[...]`, each with an "only if path exists" guard.

Core resolves `self:`/`dep:` against store shard/hash paths at relocation time
(the same resolution `wrap.rs` does today, but driven by the directive list
instead of hardcoded probes).

## Mechanism: tiny static (musl) compiled launcher

Replace generated shell scripts with a single content-hashed **static C
launcher** (built with the existing musl/toolchain), à la nixpkgs
`makeBinaryWrapper`:

- Reads `/proc/self/exe` to find itself (no `$0` walk, no `readlink`/`dirname`).
- Reads a per-binary manifest (env directives with resolved store-relative
  paths, generated at relocation time).
- Applies env, then `execv`s the real binary with `argv[0]` preserved
  (`inherit-argv0`) or set as declared.

### Why this kills the residue

- **argv[0] preserved** → `ps`/profilers show the real app; the **git alias
  hack dissolves** (git sees `argv[0]=git-upload-pack` and self-dispatches).
- **No `/bin/sh` dependency** → the static-busybox / sandbox-entry-point guard
  goes away; works as a kernel entry point.
- **alacritty/ghostty `LD_LIBRARY_PATH`** → declarative `set-default`/`unset`.
- **ghostty-bin `ld-linux` invocation** is a relocation fallback; it belongs in
  `relocate.rs`/`packed.rs`, not in wrap policy.

Shell wrappers stay only as a transitional fallback until the launcher lands.

### Launcher provisioning: Model B (build-system infrastructure)

The launcher is **not** a recipe dependency. Making every app declare
`hod-launcher` in `deps`/`runtime_deps` would (a) churn the hash of every
toolchain component the moment the helpers inject it, and (b) leak the launcher
into every app's runtime closure — dishonest, since the launcher is stamped
into the binary's bytes, not loaded at runtime.

Instead, hod provisions the launcher the same way it applies relocation and
wrapping — as a post-build fixup driven by the build system:

- `recipes/native/hod-launcher/hod-launcher.ts` imports the launcher recipe and
  calls `registerLauncher(recipe.hash)` (SDK → `hod register-launcher`), which
  records the hash under the store-config key `launcher_recipe`
  (`config` table; `store.set_config`/`get_config`).
- At build time, `build.rs::resolve_launcher_bytes` reads that config key,
  ensures the launcher is built (on demand), and passes its bytes to
  `wrap::generate_wrappers`. No package declares `hod-launcher`.
- Consequence: migrating a package to runtime metadata is **incremental** — only
  that package's hash changes; the toolchain and everything else are untouched.
  The launcher is absent from app closures (verified: see Step 4).

## Skip-list → opt-in by consequence

Wrap an executable only when its aggregated directive list is non-empty.
Compilers, `cmake`, the static musl busybox, etc. contribute/aggregate nothing
→ never wrapped → the entire name blocklist **and** the clang-relative-path
breakage evaporate (nixpkgs gets this for free: only hook users get wrapped).
Keep exactly one structural guard: never wrap a non-`PT_INTERP` static ELF.

## Single generic composer, shared by all consumers

Build one Rust composer: walk `runtime_deps`, aggregate provider `provides`,
merge the output's own `wrapper` directives, resolve sources, emit the manifest.
Share it so `run.rs` and `profile.rs` use the same logic — closing the gap where
`hod run` / profiles miss GTK/GIO/XKB env today.

## Incremental plan

1. **Metadata + SDK.** ✅ *Done.* Added the hashed `runtime` block to
   `RecipeProcess` (tail-encoded), Rust types + validation, SDK types in
   `js/src/runtime.ts` + `js/src/process.ts`, and builder helpers. No behavior
   change (absent metadata = unchanged hash).
2. **Generic composer.** ✅ *Done.* `src/composer.rs` aggregates the output's
   own `provides`, each runtime-closure provider's `provides` (with `self:`
   rebased to that provider), then the output's own `wrapper` directives, and
   resolves sources (`literal`/`self:`/`dep:`/`first_existing`) against the
   store with an existence guard. Shared consumers wired in:
   - `run.rs::compose_runtime_env` → `hod run` / `hod shell` env.
   - `profile.rs::write_env_snippets` → `env.sh` / `env.fish` / `env.systemd`.
   Because no recipe declares `runtime` yet, output is currently empty (no
   behavior change); Step 4 lights it up. Resolved directives are produced as a
   reusable `Vec<ResolvedDirective>`, ready for the Step 3 launcher manifest.
3. **Static launcher.** ✅ *Done.*
   - `launcher/hod-launcher.c`: a tiny static (musl) wrapper that resolves
     `/proc/self/exe`, reads its per-binary manifest, applies env, and `execv`s
     the real binary with `argv[0]` preserved. Built by
     `recipes/native/hod-launcher/hod-launcher.ts` (content-addressed source via
     `fileFromPath`, compiled `-static` with the seed musl toolchain) and
     installed at `libexec/hod-launcher`.
   - `src/manifest.rs`: the v1 manifest format + a `ManifestResolver` that emits
     store-relative tokens (`@self@` → output prefix, `@store@` → staging root,
     matching the `$ORIGIN/../../../<shard>/<hash>` convention in
     `relocate.rs`) with build-time existence guards, plus serialization and
     launcher stamping.
   - `src/wrap.rs`: `generate_wrappers` now computes the resolved directive list
     for the output; when it is **non-empty AND a launcher binary is present**
     among the runtime deps, it stamps `bin/<name>` with the launcher, moves the
     real binary to `bin/_hod_wrapped/<name>`, and writes the manifest to
     `bin/.hod-launcher/<name>`. Otherwise it falls back to the existing shell
     wrapper (the transitional path). Because no recipe declares `runtime`
     metadata yet, the manifest path is currently never taken — zero behavior
     change. The launcher's static-ELF nature means it is never itself wrapped.
   - Coverage: manifest serialization/resolution unit tests, plus
     `tests/launcher.rs` compiling the real C launcher and verifying argv[0]
     preservation, flag injection, token expansion, and env ops end-to-end.
4. **Port providers + delete special cases.** *In progress.* Migrate provider
   recipes one at a time; remove each `wrap.rs` special case as its recipe
   adopts the declaration. `wrap.rs` shrinks to a dumb manifest writer.

   ### Authoring levels (chosen ergonomics)

   Runtime metadata composes at three levels via a deliberately simple
   ordered-concat merge — *not* a Nix-style recursive attribute merge. The
   composer already resolves precedence through op semantics (`set` vs
   `set-default`, prefix/suffix order), so concatenating the `provides[]` then
   `wrapper[]` lists in declaration order is all that is needed:

   - **Core (mechanism):** the static launcher and (rollout step) the generic
     `XDG_DATA_DIRS` / `GSETTINGS_SCHEMA_PATH` search-path base. No metadata
     required; applies to every wrapped output.
   - **Build helper (setup-hook analog):** profile helpers wire in the launcher
     and may contribute shared `provides`/`wrapper` fragments.
   - **Recipe (author):** declares its own `runtime: { provides, wrapper }`,
     composed from fragments with `mergeRuntime(...)`.

   See the module header of `js/src/runtime.ts` for the authoring docs.

   ### Slice landed (this step's first increment)

   A single vertical slice proves the launcher path end-to-end without touching
   the shell fallback or any other package:

   - **SDK ergonomics:** `mergeRuntime(...)` added to `js/src/runtime.ts`
     (exported from `js/src/index.ts`); `shellBuild` now accepts and forwards a
     `runtime?: RuntimeMeta` to `process()` (`js/src/shell.ts`).
   - **`file` migrated** (`recipes/native/file/file.ts`): declares
     `runtime.wrapper = [set MAGIC = self:share/misc/magic.mgc]` and **nothing
     else** — no `hod-launcher` in `deps`/`runtime_deps` (Model B; the build
     system stamps the launcher from store config). This replaces the hardcoded
     `MAGIC` probe in `wrap.rs` *for this package* — but the `wrap.rs` special
     case is intentionally **left in place** until the rest of the packages
     migrate (the shell fallback still serves everything else).

   **Verification status — DONE (full from-source bootstrap proof).** SDK
   typechecks clean; `cargo build` + the `composer` / `manifest` / `wrap` unit
   tests + `tests/launcher.rs` + `tests/wrap_manifest.rs` + `tests/store_basic.rs`
   pass. `file` was then built end-to-end on a remote builder (`bees`, 32-core)
   through a **complete from-source toolchain bootstrap** (musl seed → glibc 2.41
   → gcc 13.2.0 → binutils/coreutils/make → zlib/bzip2/xz → `file`), and the
   result synced back to the local store with `copy-closure --from bees`. Both
   machines computed **identical recipe hashes** (deterministic cross-machine
   encoding). Verified:

   - `bin/file` is the **static launcher** ELF; the original is moved to
     `bin/_hod_wrapped/file`; the manifest `bin/.hod-launcher/file` contains
     exactly `EXEC @self@/bin/_hod_wrapped/file` and
     `SET MAGIC @self@/share/misc/magic.mgc` — i.e. the `MAGIC` directive came
     from the recipe's `runtime.wrapper`, not a `wrap.rs` probe.
   - At runtime `file --version` reports `magic file from <store>/…/magic.mgc`
     (the `@self@`-resolved DB), and `file /path` / `file <ELF>` correctly
     identify inputs — on both bees and the local store after sync.
   - **Clean closure (Model B):** `hod closure file` lists exactly bzip2,
     toolchain, xz, zlib, glibc — **`hod-launcher` is absent**, confirming the
     launcher is stamped infrastructure, not a runtime dependency.

   **Latent bugs found + fixed while proving the slice (all pre-existing,
   surfaced because the launcher path now actually builds via `hod`):**

   1. `recipes/native/hod-launcher/hod-launcher.ts` never imported its
      `fileFromPath` **source recipe** into the store. Fixed by
      `await importToStore(source)`.
   2. The launcher source mounts as `/deps/source/source` (no `.c` suffix), so
      `gcc` handed it to the linker → `file format not recognized`. Fixed by
      passing `-x c`.
   3. **Store integrity (`src/store/blobs.rs`):** `write()` deduped on the
      `blobs` **DB row** via `exists()`, not the on-disk file. A row can outlive
      its file (pruned blobs, or a `hod.db` synced from another store). A
      deterministic rebuild then skipped writing the file and the later `read()`
      failed with `blob not found`. Fixed `write()` to dedup on `path.exists()`.
   4. **Seed toolchain headers (`recipes/bootstrap/{seed-root,hod-seed-root}.ts`):**
      a prior local edit dropped the musl tarball's `usr/` entirely (to avoid a
      `cp -a` recursion that inflates to ~22G), but the musl.cc native gcc
      searches `<prefix>/usr/{include,lib}` by default (`gcc -print-search-dirs`),
      so `stdio.h`/crt objects vanished → "cannot run C compiled programs". Fixed
      by recreating `usr/` as **lightweight symlinks** (`usr/include → ../include`
      etc.) — no copy, no inflation, headers found.
   5. **Source staging vs wrapped coreutils (`js/src/shell.ts`):** `shellBuild`'s
      source-copy (`mkdir`/`cp`) ran **before** the hermetic preamble set up
      `/bin/sh` + the glibc runtime, resolving `mkdir`/`cp` via `PATH`. When the
      toolchain ships GNU coreutils as shell-script wrappers (`#!/bin/sh` →
      `_hod_wrapped/<tool>`), those can't execute until `/bin/sh` + ld.so exist →
      `sh: mkdir: not found`. Fixed by invoking the source-staging `mkdir`/`cp`
      via the **static shell (busybox)** applets directly (`cd` is a builtin).

   **Known follow-up (not blocking):** `src/closure.rs::parse_destination`
   cannot parse the `user@host:/abs/path` SSH form (any `/` routes it to the
   local branch); two `closure::tests::test_parse_destination_*` fail on the
   baseline. Also, `--remote-hod` must point at an updated `hod` on the remote
   (the old `~/.cargo/bin/hod` can't decode recipes carrying the new `runtime`
   tail). Both are unrelated to this work but worth separate fixes.

   ### Rollout after slice review (remaining Step 4 work)

   1. ~~Move launcher injection into the build helpers~~ — **superseded by
      Model B.** The launcher is build-system infrastructure provisioned from
      store config (`build.rs::resolve_launcher_bytes`), so there is no
      per-helper injection and no broad hash churn. Bootstrap-cycle concerns are
      moot: the launcher is never a dependency, and the manifest path simply
      doesn't engage for recipes with no runtime directives (the toolchain,
      busybox, etc. take the shell fallback / no wrap, unchanged hashes).
   ### `provides` facet proven end-to-end (second increment)

   The `file` slice only exercised the `wrapper` (self) facet. The cross-recipe
   `provides` facet — a *dependency* contributing env to its dependents — was
   then proven on real `hod` (bees) with a throwaway consumer (not committed):

   - `xkeyboard-config` declared `provides: [setEnv("XKB_CONFIG_ROOT",
     selfPath("share/X11/xkb"))]`; a minimal dynamically-linked probe declared
     **no runtime metadata of its own**, only `runtime_deps: [xkeyboard-config]`.
   - The probe's launcher manifest came out as
     `SET XKB_CONFIG_ROOT @store@/5f/5f50496d…/share/X11/xkb` — the directive was
     aggregated from the **provider**, and `@store@/5f…` is **xkeyboard-config's
     output hash**, proving `self:` rebases to the *provider's* prefix (not the
     consumer's). `hod run` printed the same resolved path.

   This validates `collect_runtime_closure` + `StoreResolver`/`ManifestResolver`
   against real stored recipes, not just the `FakeResolver` unit tests.

   ### Architectural finding: the launcher path is all-or-nothing per output

   When an output's aggregated directive list is non-empty, **every** eligible
   executable in it takes the launcher/manifest path and the shell wrapper is not
   generated at all (`src/wrap.rs` `manifest_plan` short-circuit). The shell
   wrapper is where the **generic base** (`XDG_DATA_DIRS`, `GSETTINGS_SCHEMA_PATH`,
   the `LD_LIBRARY_PATH` allowlist, EGL/DRI/`XLOCALEDIR` probes) lives today; the
   composer/manifest path emits **only** the resolved directives. Consequences:

   - Declaring `provides` on a provider **flips every consumer in its runtime
     closure** onto the launcher path the moment aggregation becomes non-empty.
     A consumer cannot be migrated "one special case at a time" — it flips
     atomically and must have **all** of its env covered before it flips, or it
     regresses (loses base env + its package-specific env).
   - Example: `xkeyboard-config`'s only real consumer is `alacritty`, which also
     needs `LD_LIBRARY_PATH` (dlopen of mesa/EGL), `__EGL_VENDOR_LIBRARY_DIRS`,
     `LIBGL_DRIVERS_PATH`, the generic base, and its `--option env.LD_LIBRARY_PATH=""`
     scrub. Committing `xkeyboard-config`'s `provides` alone would arm an
     `alacritty` regression on its next rebuild. **So it was reverted, not
     committed.** (`hod run`/profiles are unaffected — `run.rs::build_env`
     already sets the base independently and composes metadata additively.)

   ### Revised rollout order (evidence-based)

   1. **Generic base as mechanism first (was step 2).** Add `XDG_DATA_DIRS` +
      `GSETTINGS_SCHEMA_PATH` (own + closure `share`) to `src/composer.rs` so a
      flipped output keeps its base. Shared by `wrap.rs`/`run.rs`/`profile.rs`;
      de-dupe `run.rs::build_env`. This is the unblocker for flipping any GUI app.
   2. **Migrate atomically per consumer**, smallest first, deleting all of that
      consumer's `wrap.rs` special cases together once it is confirmed
      launcher-wrapped and runs after `copy-closure`. The provider declarations
      (`glib` `GIO_LAUNCH_DESKTOP`/schemas, `xkeyboard-config` `XKB_CONFIG_ROOT`,
      `libX11` `XLOCALEDIR`, `mesa` `LIBGL_DRIVERS_PATH`/EGL, `gtk4`
      `GSK_RENDERER`/`GIO_EXTRA_MODULES`, `git` exec/template, `ghostty`
      resources, `alacritty`/`ghostty` `LD_LIBRARY_PATH`) land as part of the
      first consumer that pulls them in, then are reused.
   3. **Compiler/cmake exclusion still required.** The launcher preserves
      `argv[0]` but still execs `_hod_wrapped/<tool>`, so a compiler's
      `argv[0]`-relative `cc1`/`iprefix` resolution shifts by one dir exactly as
      with the shell wrapper. Keep these on the no-wrap path (ideally via the
      structural guard / opt-in-by-consequence, not a name blocklist).
   4. Once nothing reaches the shell path, delete the shell-wrapper generator;
      `wrap.rs` becomes a dumb manifest writer (acceptance criteria below).

## What "done" looks like (acceptance criteria)

- `src/wrap.rs` contains **no** package/ecosystem names and **no** capability
  probes — only generic directive resolution + manifest emission.
- GTK4/GNOME apps (Nautilus, Geany), git, alacritty, ghostty, `file` all run
  after `copy-closure` with identical-or-better behavior, driven by metadata.
- `ps`/profilers show the real binary name for wrapped apps.
- `hod run` and profiles compose the same runtime env as the wrappers.
- Metadata is hashed: changing a provider's contribution re-identifies
  downstream outputs.
- Compilers/`cmake`/static busybox are never wrapped, with no name blocklist.
- Regression coverage for: provider aggregation, directive resolution
  (`self:`/`dep:`/`first-existing` + existence guard), argv0 preservation,
  opt-in wrapping.
