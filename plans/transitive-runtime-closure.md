# Transitive Runtime Closure in the Sandbox

**Status:** implemented (validated locally; minimal-vm profile builds end to end)
**Owner:** core
**Depends on:** `real-store-in-sandbox.md` (the layout-unification work landed Phases 1, 2, 4 — they are prerequisites here)
**Unblocks:** the K1 fix (the `runtime_deps: ["glibc"]` Phase 5 additions in `real-store-in-sandbox.md` are inert without this)

## Summary

When recipe X declares `dep("Y", ...)`, hod bind-mounts Y at
`/store/staging/<Y-shard>/<Y-hex>/` inside X's build sandbox. Today this is
the *direct* dep set only. Y's own runtime requirements — the staging dirs
that Y's relocated binaries reference via store-relative RUNPATH — are
**not** mounted unless X happens to declare them as direct deps too.

This plan adds **transitive runtime closure** to the sandbox bind-mount
set. For each direct dep Y, we recursively walk Y's `runtime_deps` and
add every reachable staging dir to the bind-mount set. Transitive deps
are mounted at their canonical store path only; they get **no**
`/deps/<name>/` alias (only direct deps do).

## Why this is needed

The work in `real-store-in-sandbox.md` made the sandbox's path geometry
match the host store. That fixed the *layout* problem: a relocated
binary's RUNPATH `$ORIGIN/../../../<glibc-shard>/<glibc-hex>/lib`
resolves to identical physical paths on host and in sandbox.

But it left a separate problem unsolved: when bash is built with
`runtime_deps: ["glibc"]`, its relocated `.bash-wrapped` ELF carries a
RUNPATH that points to glibc's staging shard. When bash is then bundled
into the toolchain via `cp -a`, the bundled `.bash-wrapped` still
references the glibc shard. When a downstream recipe like `bat` builds
with `dep("toolchain", ...)` but no direct `dep("glibc", ...)`, glibc's
staging shard is *not* bind-mounted in bat's sandbox, and bash's RUNPATH
lookup for libc fails.

This was discovered empirically while validating Phase 5 of
`real-store-in-sandbox.md`:

```
$ hod profile build profiles/minimal-vm.ts
[hod] [1/21] building bat...
/deps/toolchain/bin/mkdir: exec: line 31: /deps/toolchain/bin/.mkdir-wrapped: not found
hod: build failed
```

Pre-Phase-5, this didn't surface because the K1 recipes had no
`runtime_deps`, no relocation pass ran on them, and they "worked" only
because the consumer's `glibcLinker` preamble symlinked glibc into
`/lib`. That was the bug Phase 5 was meant to fix. Without transitive
closure, Phase 5 trades one breakage for another.

## What "transitive runtime closure" means here

For a recipe X with direct deps `[D1, D2, …]`:

1. Each direct dep `Di` is bind-mounted at
   `/store/staging/<Di-shard>/<Di-hex>/` and aliased at `/deps/<Di-name>/`
   (unchanged from today).
2. For each `Di`, look up its built recipe in the store. If it's a
   `Process` with `runtime_deps: [N1, N2, …]`, resolve each `Nj` against
   `Di`'s own `dependencies:` list to get an output hash `Hj`. Add `Hj`
   to a worklist.
3. Recurse: each `Hj` may itself be a `Process` with `runtime_deps`.
4. Dedupe by output hash.
5. Bind-mount every resolved output hash from the worklist at its
   canonical store path. **Do not create `/deps/<name>/` aliases for
   transitive deps.**

The traversal follows **only `runtime_deps` edges**, not all
`dependencies:` edges. Build-time-only deps (gcc-stage1, source
tarballs, intermediate stages) do not propagate. This matches Nix's
`buildInputs` vs. runtime-closure distinction.

## Why no `/deps/<name>/` aliases for transitive deps

Two transitive deps could legitimately have the same name with
different output hashes (e.g., a deep chain pulling in two openssl
versions). Auto-aliasing would force a wrong-by-default winner; refusing
to alias preserves the principle that "if you want to refer to a dep by
name, declare it directly."

The bind-mount at the canonical store path is enough for store-relative
RUNPATH/PT_INTERP resolution, which is the entire reason transitive
deps need to be present. Build scripts that want named access should
declare the dep directly.

## Hermeticity stance

Hod's hermeticity guarantee is and remains: **the recipe hash
determines the output**. A recipe's output is a deterministic function
of its inputs (recipe text, dep recipe hashes, runtime_deps names,
flags) on a given hod version. Whether unrelated transitively-pulled
deps are bind-mounted in the sandbox does not affect this — they're at
the canonical store path, not on PATH, not at `/deps/<name>/`, and
build scripts in hod-land use absolute `/deps/<name>/` references.

A recipe that *deliberately* walked `/store/staging/` looking for
arbitrary content would not be hermetic in any meaningful sense, and
no such recipe exists today. The plan documents that recipes should
not do this.

## Cache coherence

This change modifies hod's evaluator (the function from recipe hash to
output hash) without changing the recipe encoding or recipe hash.
Implications:

- **Cached outputs remain bit-valid.** Nothing in the store gets
  retroactively wrong. Recipes whose outputs are already in the cache
  return those cached outputs and don't re-run.
- **Future force-rebuilds of currently-cached recipes** that don't
  implicitly use a transitively-pulled dep produce bit-identical
  output. Same recipe hash, same output hash.
- **Future builds of currently-broken recipes** (the bat/profile-build
  failure, plus any K1 follow-on) now succeed. They produce real
  output hashes that didn't exist in the cache before.
- **A hypothetical recipe that walks `/store/staging/` looking for
  content** could in principle produce different output before vs.
  after. No such recipe exists. The plan documents "don't write
  recipes that do this."

We do **not** bump a sandbox-version byte into the recipe encoding.
Doing so would force every recipe to get a fresh hash and trigger a
full rebuild, with no realistic benefit given the constraints above.
The invariant we rely on is: *same recipe hash, same hod version,
deterministic output hash*. Crossing this change is a hod-version
event; the plan is the documentation of that event.

## Implementation plan

### Phase A — recipe lookup by output hash

`src/build.rs::build_process` knows direct deps' output hashes via
`dep_outputs.named`. To walk runtime closure we need to go from output
hash → recipe → recipe's runtime_deps and dependency edges. The store
already supports this:

- `Store::output_recipe_hash(output_hash)` (or equivalent) returns the
  recipe hash that produced it.
- `Store::get_recipe(recipe_hash)` returns the full `Recipe`.

If those APIs don't exist or are inconvenient, factor out a helper
`fn runtime_closure(store: &Store, root_outputs: &[Hash]) -> BTreeMap<Hash, ()>`
in `src/build.rs` (or `src/closure.rs`).

### Phase B — closure walk

```rust
fn collect_runtime_closure(
    store: &Store,
    direct_outputs: &[Hash],
) -> Result<BTreeSet<Hash>, BuildError> {
    let mut visited = BTreeSet::new();
    let mut worklist: VecDeque<Hash> = direct_outputs.iter().copied().collect();

    while let Some(out_hash) = worklist.pop_front() {
        if !visited.insert(out_hash) { continue; }

        // Map output -> recipe hash -> Recipe
        let Some(recipe_hash) = store.output_recipe_hash(&out_hash)? else {
            continue;
        };
        let Some(recipe) = store.get_recipe(&recipe_hash)? else {
            continue;
        };
        let Recipe::Process(p) = recipe else { continue; };
        let Some(runtime_deps) = &p.runtime_deps else { continue; };

        // Resolve each runtime_dep name to an output hash via the
        // recipe's own dependencies list.
        for dep_name in runtime_deps {
            if let Some(dep_recipe_hash) = p.dependencies
                .iter()
                .find(|d| d.name.as_deref() == Some(dep_name))
                .map(|d| d.recipe_hash)
            {
                if let Some(dep_out) = store.recipe_output_hash(&dep_recipe_hash)? {
                    worklist.push_back(dep_out);
                }
            }
        }
    }

    // Direct outputs are in the visited set; the *transitive* set is
    // visited \ direct_outputs.
    let direct: BTreeSet<Hash> = direct_outputs.iter().copied().collect();
    Ok(visited.difference(&direct).copied().collect())
}
```

Sketch only — exact API names and error handling will follow what
`store.rs` already exposes.

### Phase C — wire into `build_process`

After building `dep_mounts` from `dep_outputs.named` (today's logic),
compute the transitive closure of those output hashes and append a
new `DepMount` for each transitive entry. Transitive `DepMount` entries
have:

- `name`: `"<transitive>"` (or any sentinel — it must NOT be aliased
  under `/deps/<name>/`)
- `host_staging_path`, `store_shard`, `store_hex`: as usual

Update `src/sandbox.rs::mount_filesystem` to skip the `/deps/<name>/`
alias creation when the name starts with `<` (matching the existing
`if name.starts_with('<')` skip in `build.rs:941`).

### Phase D — toolchain recipe edits

For Phase 5 of `real-store-in-sandbox.md` to deliver value with
transitive closure in place, two edits:

1. `recipes/toolchain/native-toolchain.ts`: add
   `runtime_deps: ["glibc"]` so downstream consumers of `dep("toolchain")`
   transitively get glibc bind-mounted.
2. `recipes/toolchain/native-toolchain.ts`: change `cp -a SRC/* DST/` to
   `cp -a SRC/. DST/` for the K1 deps (bash, coreutils, sed, grep, tar,
   patch). POSIX `*` doesn't match dotfiles, so the `.foo-wrapped` ELFs
   weren't copied. This is an independent bug from the closure issue
   but blocks the same scenario.

### Phase E — validation

1. Force-rebuild `bat` (`hod build --force recipes/native/rust/bat/bat.ts`).
   With transitive closure + the toolchain edits, glibc is bind-mounted
   in bat's sandbox via the toolchain's `runtime_deps`, the bundled
   `.foo-wrapped` ELFs are present (cp glob fix), and they find libc
   via store-relative RUNPATH. Build should succeed.
2. Spot-rebuild a handful of profile packages: ripgrep, htop, jq, file.
3. Smoke-test the resulting binaries on the host (each runs and prints
   `--version`).
4. If those pass, run `hod profile build profiles/minimal-vm.ts` and
   spot-check the full set.

We do not require Alpine VM validation in this plan; the transitive
closure semantics are host-machine-agnostic, and the layout work in
`real-store-in-sandbox.md` already covers the cross-machine case.

## Acceptance criteria

1. ✅ `src/build.rs` walks the runtime closure of direct deps and adds
   transitive entries to `dep_mounts`.
2. ✅ Transitive entries are bind-mounted at canonical store paths but
   NOT aliased under `/deps/<name>/`.
3. ✅ The toolchain recipe declares `runtime_deps: ["glibc"]`.
4. ✅ The toolchain recipe's `cp -a` calls use `SRC/.` form so
   `.foo-wrapped` ELFs are copied.
5. ✅ Force-rebuilding bat against the new behavior succeeds and
   produces a working binary on the host.
6. ✅ A handful of other minimal-vm profile packages (ripgrep, htop,
   jq, file) rebuild successfully and run.
7. ✅ Existing cargo unit tests still pass.

## Out of scope

- Bumping a sandbox-version byte. We rely on the documented invariant
  (same recipe hash + same hod version ⇒ same output hash) and accept
  that crossing this change is a hod-version event.
- Strict hermeticity that hides un-declared transitive deps from the
  build script. Not worth the complexity; no current recipe depends on
  the absence of transitive content.
- Resolving name collisions in transitive deps. Sidestepped by not
  aliasing transitive deps under `/deps/<name>/`.
- Closure-walking for non-Process recipes. Files, Directories, and
  GitFetch recipes don't have `runtime_deps` and are leaves of the
  graph from this perspective.
- Validating against the Alpine VM or ThinkPad. Tracked separately.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| A recipe's output drifts after the change because its build script implicitly used a transitively-pulled dep. | Very low (no recipe walks /store/staging today). | Document the invariant. If a regression appears, fix that recipe to declare the dep directly. |
| Closure walk is slow for deep dep graphs. | Low — closures are tens of nodes at worst, store lookups are SQLite indexed. | Profile if it shows up. Cache the closure per direct-dep hash if needed. |
| Transitive deps include something with conflicting absolute paths (e.g., two recipes that both write `/share/foo`). | Very low — transitive deps live at unique `/store/staging/<shard>/<hex>/` paths; no collision possible in the bind-mount set. | None needed. |
| The `<transitive>` sentinel name collides with a future internal sentinel. | Trivially low. | Pick a name that's clearly synthetic. The existing `<workdir>` and `<scaffold>` set the convention. |

## Postscript: implementation findings (2026-05-27)

Implementation went smoothly except for one issue surfaced during
validation, captured here so future readers don't repeat the analysis:

### `wrap.rs` had to learn to skip static binaries

Adding `runtime_deps: ["glibc"]` to the toolchain caused `wrap.rs` to
generate a wrapper script for **every** ELF in `bin/`, including the
musl-static busybox. That broke sandbox bootstrapping: when a downstream
recipe's `command:` field invokes `/deps/toolchain/bin/busybox`, the
kernel reads the wrapper's `#!/bin/sh` shebang and tries to exec
`/bin/sh` — but `/bin/sh` doesn't exist yet, because the script that
sets it up hasn't run.

The fix in `src/wrap.rs::generate_wrappers`: skip ELFs that have no
`PT_INTERP` (i.e., static binaries). Static binaries don't need
wrappers — they have no dynamic linker, no DT_RPATH, no XDG_DATA_DIRS
concerns. The detection uses `crate::packed::parse_interp(&data).is_none()`.

This wasn't anticipated in the plan because the toolchain was the
first recipe to ever ship a static binary alongside dynamically-linked
ones with `runtime_deps`. Worth knowing for any future recipe that
mixes static and dynamic outputs.

### Validation results

- `validate-reloc.ts` builds (137 ms cached → fresh run also OK).
- Toolchain rebuilds with `runtime_deps: ["glibc"]` and `cp -a SRC/.`
  globs in 1.4 s (relocate + wrap pass only, build cache hit).
- `bat` rebuilds in 44 s and runs on the host.
- Full `minimal-vm` profile builds end to end (20/20 packages,
  including ripgrep, htop, jq, file, fzf, less, tree, wget, curl,
  bash, coreutils, etc.). All twelve smoke-tested binaries run on the
  host with no env setup.
- 69/69 cargo lib tests pass.
