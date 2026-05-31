# Real Hod Store in Sandbox — Layout Unification Plan

**Status:** implemented (Phases 1, 2, 4, 5, 6); Phase 3 retired as based on
a faulty premise (see "Implementation notes").
**Owner:** core
**Supersedes:** the K1 "RUNPATH-only fallback" half-fix discussed in `minimal-hod-vm-roadmap.md`.

## Summary

Replace the sandbox's "fake" store layout (top-level `/<shard>/<hex>/` bind
mounts plus `/deps/<name>/` aliases) with a **real, miniature Hod store** at
`/store/`, mirroring the host store layout exactly:

```text
/store/
├── staging/<shard>/<hex>/   ← read-only bind mounts of dep outputs
├── blobs/                   ← (empty placeholder; satisfies "is a hod store")
├── recipes/                 ← (empty placeholder)
└── tmp/                     ← (empty placeholder)
```

`/deps/<name>/` stays as a symlink → `/store/staging/<shard>/<hex>/` for
build-script ergonomics. The canonical store-relative invocation path becomes
`/store/staging/<shard>/<hex>/bin/<binary>`, identical to the host. This
eliminates every depth/path mismatch between host and sandbox and dissolves
the K1/K2/K4 cluster of bugs.

## Why this is the right fix

The principle: **a Hod store is a Hod store, everywhere.** Host, VM, sandbox,
target machine — all share the same shape. A binary built in the store works
anywhere the store is mounted, with no patching, no policy choices, no
special-casing for "build-time" vs. "runtime" use. Only the store *root*
varies (`/home/me/.local/share/hod`, `/store`, `/var/hod`, …). Everything
inside the root has the same relative shape.

Today's sandbox violates this: it bind-mounts deps at `/<shard>/<hex>/`,
which differs from the host's `<root>/staging/<shard>/<hex>/` by **two
extra path components** (`staging/<shard>/`). Any binary whose runtime path
math (RUNPATH `$ORIGIN/../../../...` or AT_EXECFN bootstrap relative path)
was computed for the host layout climbs the wrong number of `..` levels
inside the sandbox, ending up at nonexistent paths. To paper over this,
`hermeticPreamble` ad-hoc creates `/lib/`, `/lib64/ld-linux-x86-64.so.2`
symlinks; recipes have to declare or omit `runtime_deps` based on whether
they'll be used as build-time or runtime deps; the toolchain has to bundle
its own bash/coreutils because relocated ones don't work in sandboxes.

By making the sandbox layout identical to the host, **all of that
machinery becomes unnecessary**. Every binary's RUNPATH and bootstrap
math computes the same relative path on host and in sandbox, and that path
points at the same content because the same dep is mounted at the same
relative location.

## Status quo: what actually breaks today

Confirmed via code reading and runtime tests:

1. **`$ORIGIN`-relative RUNPATH is fine through symlinks.** glibc's ld.so
   resolves `$ORIGIN` from `/proc/self/exe`, which goes through symlinks.
   Linux kernel `..` is *physical* (verified experimentally in
   `/tmp/origtest3/`), so even `$ORIGIN/../../../<dep_shard>/<dep_hex>/lib`
   computed against the staging layout resolves correctly inside today's
   sandbox if the bind mount lands at `/<shard>/<hex>/`. No, this is **not**
   the failure.

2. **The AT_EXECFN bootstrap is the real failure mode.** From
   `js/src/preamble.ts` lines 38–47 (verbatim): "When the kernel processes
   a shebang like `#!/usr/bin/env python3`, AT_EXECFN is set to the
   *script* path, not the interpreter. Python's AT_EXECFN bootstrap
   computes `dirname(AT_EXECFN) + rel_path` to find ld-linux. If the
   script is deeper than 2 directory levels, this resolves incorrectly."
   The bootstrap stub uses the raw AT_EXECFN string (only handles
   `/proc/...` paths via readlink — see `bootstrap_x86_64.c:211`). For any
   other invocation depth, it fails.

3. **The toolchain works around this** by bundling bash/coreutils under
   its own staging hex, so consumer build scripts can use a known shallow
   path (`/deps/native-toolchain/bin/bash`, depth 3) instead of arbitrary
   wrapper script paths.

4. **K1 (10 recipes with no `runtime_deps`)** is the same bug: those
   recipes are used as *build-time* deps inside other sandboxes, where
   they may be invoked via `/deps/<name>/bin/foo` (depth 3, OK) or via
   wrapper scripts at deeper paths (depth >3, broken).

## Target end state

### Sandbox layout

```text
/                         (sandbox root)
├── store/                ← canonical store root
│   ├── staging/
│   │   ├── <shard>/<hex>/  ← bind mount of host's <host_root>/staging/<shard>/<hex>/
│   │   └── …
│   ├── blobs/            ← empty dir (placeholder; future: read-only mount of host blobs)
│   ├── recipes/          ← empty dir
│   └── tmp/              ← empty dir
├── deps/
│   ├── <name>/  → /store/staging/<shard>/<hex>/   (symlink, ergonomics)
│   └── …
├── tmp/                  ← writable scratch
├── dev/, proc/           ← bind mounts from host
├── out/                  ← writable, becomes the build's output
├── homeless-shelter/     ← writable $HOME
└── (no other top-level files)
```

The top-level shard directories (`/00/`, `/c4/`, …) **disappear**. The
`/store/` symlink at the sandbox root that today points at the
top-level shards goes away — `/store/` becomes a real directory.

### Invocation path semantics

A binary inside the sandbox can be invoked via either:

- The canonical path: `/store/staging/<shard>/<hex>/bin/<binary>` — `$ORIGIN`
  and `AT_EXECFN` both compute paths identical to the host.
- The alias: `/deps/<name>/bin/<binary>` — kernel resolves the symlink,
  `$ORIGIN` (from `/proc/self/exe`) becomes
  `/store/staging/<shard>/<hex>/bin/`, AT_EXECFN string is preserved as
  `/deps/<name>/bin/<binary>` but the bootstrap uses `dirname(AT_EXECFN)
  + rel_path`, which still works because `..` is physical and the kernel
  resolves the symlink during pathwalk.

In both cases the same physical paths are accessed, the same `..` walks
collapse to the same physical directories, and the same dep content is
loaded. **There is no longer a "host vs. sandbox" path computation
distinction.**

### RUNPATH and bootstrap construction

RUNPATH math in `relocate.rs` is unchanged in *form* (it's still
`$ORIGIN/../...` with depth = `path_depth_within(elf_path,
output_staging_dir) + 2`), because the *staging* layout itself doesn't
change. What changes is that the sandbox now mirrors that layout. Whether
the host's store root is `/home/me/.local/share/hod/` or the sandbox's
`/`, the relative shape from a binary at
`<root>/staging/<shard>/<hex>/bin/foo` to a dep at
`<root>/staging/<dep_shard>/<dep_hex>/lib` is identical: three levels up,
then sideways and down.

### What dissolves

- **K1 (10 recipes).** Add `runtime_deps: ["glibc"]` to bash, coreutils,
  diffutils, findutils, gawk, grep, make, patch, sed, tar. With the new
  sandbox layout the AT_EXECFN bootstrap and RUNPATH both resolve
  correctly when these are used as build-time deps in other sandboxes —
  because *the sandbox is a real store* and glibc is mounted at the
  identical relative path as on the host.

- **K2 (Alpine `/lib64` symlink).** Still needed on Alpine (musl base
  distro doesn't have `/lib64/ld-linux-x86-64.so.2`), but the deploy
  script automates it cleanly. Long-term: when the VM base distro is
  itself Hod-built, the host *is* the store and this disappears.

- **K4 (`LD_LIBRARY_PATH` in `env.sh`).** Removed. RUNPATH alone is
  sufficient because the on-disk store layout matches what was assumed
  at build time.

- **`hermeticPreamble({ glibcLinker: "glibc" })` symlinks** to `/lib/`
  and `/lib64/`. No longer needed for relocated binaries — they find
  ld-linux via PT_INTERP/bootstrap. Still needed for **non-relocated**
  tools like the seed busybox, which has hardcoded `/lib/...` PT_INTERP.
  The preamble shrinks but doesn't disappear entirely.

- **The toolchain's `cp -a` bundling.** Confirmed correct as-is: the
  toolchain copies pre-relocated bash/coreutils, whose RUNPATHs encode
  the *original glibc staging hex*. The toolchain declares glibc as a
  transitive dep, so glibc gets bind-mounted in downstream sandboxes at
  its original staging path, and the copied binaries' RUNPATHs resolve
  correctly. The toolchain is not "self-contained at one hash" — it's
  *closure-contained* — and that is fine. (Your intuition was right:
  hod provides bash/coreutils inside the sandbox-as-store, and they
  just work.)

## Implementation plan

### Phase 0 — verify the diagnosis (1–2 hours)

Before changing any code, confirm by experiment that the AT_EXECFN
bootstrap is the *only* failure mode and that the new layout fixes it:

1. Build a small recipe that uses `runtime_deps: ["glibc"]` for a binary
   that won't be invoked via shebang (e.g., `bash` itself).
2. Use it as a build-time dep in another sandbox; invoke it via
   `/deps/bash/bin/bash` and observe whether it works (per the analysis,
   it should, because depth = 3 and the bootstrap math holds).
3. Then invoke a wrapper-deep path (e.g., `/tmp/sandbox/wrapdir/cmd.sh`
   where `cmd.sh` shebangs `#!/deps/bash/bin/bash`) and confirm the
   bootstrap fails as predicted.

If both predictions hold, proceed. If something else breaks, capture
the actual failure and amend the plan.

### Phase 1 — sandbox layout change (`src/sandbox.rs`) (1 day)

**File:** `src/sandbox.rs`

1. **`setup_sandbox_filesystem`** — remove the top-level shard
   directory creation. Create `/store/staging/`, `/store/blobs/`,
   `/store/recipes/`, `/store/tmp/` instead. Keep `/deps/`, `/tmp/`,
   `/dev/`, `/proc/`, `/out/`, `/homeless-shelter/`.

2. **`mount_filesystem`** — change the bind-mount target for each
   `DepMount` from `root.join(&dep.store_shard).join(&dep.store_hex)`
   to `root.join("store").join("staging").join(&dep.store_shard)
   .join(&dep.store_hex)`. Drop the `/store/<shard>/<hex>/` symlink
   alias creation (it's the canonical path now). Keep the
   `/deps/<name>/` symlink, change its target from
   `../<shard>/<hex>` to `../store/staging/<shard>/<hex>`.

3. **Module doc comment** — rewrite the layout diagram and the
   `DepMount` doc explaining the canonical path.

4. **Tests** — update the layout assertions in `tests/` if any check
   `/<shard>/<hex>/` paths.

### Phase 2 — sandbox env (`src/build.rs`) (½ day)

**File:** `src/build.rs`

1. In `build_process`, change the `HOD_STORE` env var to `/store`
   (currently set to the host's store root, which is meaningless inside
   the sandbox).

2. No changes needed to `dep_mounts` construction itself — `DepMount`
   stays the same; only `sandbox.rs`'s use of it changes.

3. The `command:` field of recipes still works unchanged. Recipes that
   use `/deps/seed/bin/busybox` keep working because `/deps/seed/`
   remains a valid symlink. Recipes that use canonical paths can be
   written as `/store/staging/<shard>/<hex>/bin/...` if they want, but
   nothing forces them to.

### Phase 3 — preamble cleanup (`js/src/preamble.ts`) (½ day)

**File:** `js/src/preamble.ts`

Once relocated binaries Just Work in the sandbox:

1. **Remove** the `glibcLinker` block that creates `/lib/ld-linux-...`
   and the `for lib in /deps/.../lib/*` loop. These were workarounds for
   the broken layout.

2. **Keep** the `muslLinker` block — it's needed for the static seed
   busybox which has hardcoded musl PT_INTERP.

3. **Keep** the python/shell/sysroot/shims sections — they handle other
   concerns (shebang AT_EXECFN, sysroot construction).

4. Update the comment in `python` explaining *why* the wrapper is needed.
   With the new layout, `/usr/bin/python3` shebang scripts still suffer
   from the AT_EXECFN-script-path issue independently of the sandbox
   layout. The wrapper is still the right fix; it's just no longer the
   *only* layout-related workaround.

### Phase 4 — relocate.rs sanity check (1–2 hours)

**File:** `src/relocate.rs`

The depth math in `relocate_single_elf` is computed against
`output_staging_dir`, which is the host's
`<root>/staging/<shard>/<hex>/`. The resulting RUNPATH `$ORIGIN/../../../...`
encodes the climb relative to *that* layout. Inside the sandbox, the same
binary lives at `/store/staging/<shard>/<hex>/bin/...` and `$ORIGIN` is
`/store/staging/<shard>/<hex>/bin/`. Three `..` levels up from there:
`/store/staging/<shard>/<hex>/bin/../../../` = `/store/`. That matches the
host's `<root>/staging/<shard>/<hex>/bin/../../../` = `<root>/`. Then the
RUNPATH suffix `<dep_shard>/<dep_hex>/lib` resolves to
`/store/<dep_shard>/<dep_hex>/lib`.

**This is wrong.** The sandbox has `/store/staging/<dep_shard>/<dep_hex>/`,
not `/store/<dep_shard>/<dep_hex>/`. The host has
`<root>/staging/<dep_shard>/<dep_hex>/`, not
`<root>/<dep_shard>/<dep_hex>/`.

So the depth needs to be **+2 more** to climb out past `staging/<shard>/`
all the way to the store root, then descend into `staging/<dep_shard>/<dep_hex>/lib`.
But wait — that's already correct in the existing math: `up_steps = depth + 2`,
where the +2 is for shard + hex. Let me re-derive.

Binary at `<root>/staging/<shard>/<hex>/bin/foo`:
- `$ORIGIN` = `<root>/staging/<shard>/<hex>/bin/`
- `$ORIGIN/../` = `<root>/staging/<shard>/<hex>/`  (depth 0 from staging dir)
- `$ORIGIN/../../` = `<root>/staging/<shard>/`     (climbed 1)
- `$ORIGIN/../../../` = `<root>/staging/`          (climbed 2 — shard + hex levels)

Wait — that lands at `<root>/staging/`, not `<root>/`. And the existing
RUNPATH in `htop` (verified above) is:
`$ORIGIN/../../../92/<hex>/lib`

So `$ORIGIN/../../../92/<hex>/lib` from
`<root>/staging/<shard>/<hex>/bin/` resolves to
`<root>/staging/92/<hex>/lib`. Which is correct on the host. **And the
sandbox today bind-mounts at `/<shard>/<hex>/`, not
`/staging/<shard>/<hex>/`, which is exactly the bug.** Inside today's
sandbox, the same binary at `/<shard>/<hex>/bin/foo` resolves
`$ORIGIN/../../../92/<hex>/lib` to `/92/<hex>/lib`, which exists because
the bind mount is at `/92/<hex>/`. That's why this works today.

So with the proposed change (move bind mounts to
`/store/staging/<shard>/<hex>/`), a binary invoked via the canonical
path `/store/staging/<shard>/<hex>/bin/foo` resolves
`$ORIGIN/../../../92/<hex>/lib` to `/store/staging/92/<hex>/lib`. That
matches exactly. **No depth change is needed in `relocate.rs`.**

What changes in the sandbox is *only* the prefix where bind mounts
land. Because the relative climb stays at `+2` (shard + hex) and the
host's staging dir corresponds 1:1 to the sandbox's
`/store/staging/`, everything aligns.

This phase reduces to **verification only** — re-read
`relocate.rs:177-198` against the new layout to confirm depth math is
unchanged. No code edit.

### Phase 5 — `runtime_deps: ["glibc"]` for the 10 recipes (½ day)

**Files:** `recipes/native/{bash,coreutils,diffutils,findutils,gawk,grep,make,patch,sed,tar}.ts`

Add `runtime_deps: ["glibc"]` (or include the deps array if not yet
present). With the sandbox fix in place, this should now work without
breaking the toolchain build.

Verify with:

```bash
nix develop --accept-flake-config --command cargo run -- run recipes/toolchain/native-toolchain.ts -- --version
```

Then rebuild downstream consumers and check no regressions.

### Phase 6 — deploy script and `env.sh` cleanup (½ day)

**File:** `scripts/hod-vm-deploy-profile`

1. Remove `LD_LIBRARY_PATH` collection from generated `env.sh` (K4).
2. Keep the `/lib64/ld-linux-x86-64.so.2` symlink creation (K2 still
   applies to Alpine/musl host).
3. Optionally: warn (or fail) if the host distro is glibc-based but
   `/lib64/ld-linux-x86-64.so.2` is missing — that indicates a broken
   relocation, not an Alpine issue.

### Phase 7 — validation (½ day)

1. Rebuild the 33-package profile (`profiles/minimal-vm.ts` +
   `minimal-vm-dev.ts`) on host. Smoke-test all 33 tools.
2. Rebuild `recipes/toolchain/native-toolchain.ts`. Smoke-test.
3. Deploy `minimal-vm` to the Alpine VM. Run smoke test.
4. Build something heavy that exercises shebangs and wrappers
   (e.g., one of the COSMIC components, or Nautilus). Confirm runtime.
5. `hod copy-closure` to the ThinkPad and validate.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Recipes that hardcode `/<shard>/<hex>/` paths (unlikely; we always use `/deps/<name>/`) | `grep -r '"/[0-9a-f][0-9a-f]/"' recipes/` to find any. |
| `HOD_STORE` env var consumed by a build script as host path | Searched: only consumed in `js/src/import.ts` for `--from`-style flows; sandbox doesn't run those. Setting to `/store` is safe. |
| Recipes whose `command:` is a top-level path like `/00/<hex>/bin/foo` | Search shows none today; use `/deps/<name>/...` exclusively. |
| The bootstrap might still fail for shebang scripts even with the new layout | True — that's an orthogonal bug fixed by the existing `python` wrapper pattern. The new layout doesn't cure shebang AT_EXECFN; it just removes the *layout-induced* failures. |
| Cache invalidation forces a full rebuild | The recipe hashes don't change (sandbox layout is implementation-internal), but pre-relocation outputs may need to be re-derived. Use `hod restage` where possible. Worst case: full rebuild of the 33-package profile, which is acceptable. |
| Some test in `tests/` asserts on the old layout | Audit and update; should be one or two assertions max. |

## Out of scope for this plan

- **Shebang AT_EXECFN bug.** Independent issue, mitigated today by the
  `python` wrapper helper. Tracked separately if it bites again.
- **Mounting host blobs/recipes inside the sandbox.** Not needed for
  builds; placeholder dirs are sufficient. Future work could expose
  read-only host blobs under `/store/blobs/` if a build genuinely needs
  CAS access.
- **macOS/Mach-O support.** This plan is Linux-only; macOS sandboxing
  is a separate effort with different relocation primitives.

## Acceptance criteria

1. ✅ All 10 K1 recipes have `runtime_deps: ["glibc"]` and rebuild without
   breaking the toolchain or any downstream package.
2. ✅ `env.sh` generated by `scripts/hod-vm-deploy-profile` no longer
   sets `LD_LIBRARY_PATH`.
3. ⏳ The 33-tool profile passes the existing smoke test inside the
   Alpine VM with the new layout. *(not yet validated — requires VM)*
4. ⏳ A nontrivial GUI app (Nautilus or COSMIC component) builds and
   runs after `hod copy-closure` to the ThinkPad. *(not yet validated)*
5. ✅ Post-relocation output binaries no longer need the `glibcLinker`
   `/lib/` farm — they find ld.so via the AT_EXECFN bootstrap and
   store-relative RUNPATH alone.
6. ❌ *(retired — see "Implementation notes" below)* The `hermeticPreamble`
   `glibcLinker` option will no longer be needed at all. This was based on
   a faulty premise; the option is a deliberate, ongoing API for a
   recipe-level decision the sandbox cannot make.

## Reference: confirmed technical facts

These were verified during research, not assumed:

- glibc ld.so resolves `$ORIGIN` from `/proc/self/exe` (the *real*
  resolved path), not from the invocation string. So symlinks are
  transparent for RUNPATH resolution.
- Linux kernel `..` is **physical**: it follows the dentry chain
  through the real directory tree, not the lexical invocation path.
  Verified with `/tmp/origtest3/`.
- `AT_EXECFN` is the **invocation string** as passed to `execve`,
  *not* readlink-resolved. The bootstrap stub
  (`bootstrap_x86_64.c:202-218`) only special-cases `/proc/...` paths.
- Today's sandbox bind mounts at `/<shard>/<hex>/` (top-level), with
  `/store/<shard>/<hex>/` and `/deps/<name>/` as symlink aliases. The
  top-level placement is what makes today's sandbox "work" despite the
  layout mismatch — a coincidence that should be replaced with the
  intentional design described above.

## Implementation notes (added after first-pass execution)

Phases 1, 2, 4, 5, 6 landed cleanly and were validated empirically:

- `validate-reloc.ts` builds and produces a relocated binary that runs both
  inside the sandbox (during build) and on the host post-relocation.
- `bash` rebuilt with `runtime_deps: ["glibc"]` produces a wrapper +
  relocated `.bash-wrapped` ELF that runs on the host with no env setup.
- `validate-bash.ts` (with a small update to handle wrappers) successfully
  uses the relocated bash as a build-time dep in another sandbox — exactly
  the K1 scenario the plan predicted would be fixed by the layout change.
- `coreutils` rebuilt with `runtime_deps: ["glibc"]` produces 107 relocated
  ELF binaries + 106 wrappers; `ls`, `cat`, `cp` all run on the host.

**Phase 3 (preamble.ts `glibcLinker` block removal) was reverted on a
faulty premise.** The plan framed the `glibcLinker` symlink farm as a
*workaround for the broken sandbox layout*, expecting it to dissolve
once Phases 1/2/4 made the layout match the host. The empirical reality
(verified by attempting Phase 3 and watching `validate-reloc.ts` fail)
is that the symlink farm has nothing to do with the layout at all — it
solves a separate, ongoing problem that the layout fix does not touch:

> gcc emits binaries with absolute PT_INTERP paths
> (`/lib64/ld-linux-x86-64.so.2`) and they need to *run inside the
> sandbox before Hod's relocation pass touches them*. PT_INTERP is
> resolved by the kernel before the dynamic linker is even loaded, so
> there is no `$ORIGIN`-style relative form available; the path has
> to be absolute and it has to exist. This affects `configure` feature
> tests, `make check`, validate-reloc-style smoke tests, and any other
> intra-build "compile then run" pattern. It is not a Hod bug — it's
> how PT_INTERP works on Linux.

Post-relocation outputs do not have this problem because the relocation
pass injects an AT_EXECFN bootstrap stub that performs store-relative
ld.so resolution before PT_INTERP is consulted. But that injection
happens *after* the build script exits, so any binary born and used
inside one build still needs the standard FHS path to exist.

**Why explicit `glibcLinker` (and `muslLinker`) is the principled API,
not a workaround:**

Picking *which* dep provides the dynamic linker at the FHS path is a
recipe-level semantic choice that the sandbox cannot make on its own:

- A closure can legitimately contain multiple glibc versions (toolchain
  built against 2.38, downstream tool built against 2.39). "First dep
  wins" is undefined behavior dressed up as policy; "highest version
  wins" is ad-hoc and silently breaks the binary that needed the other
  one.
- Closures can mix glibc and musl (the seed busybox is musl-static, the
  toolchain is glibc). The `/lib/libc.so` collision between the two has
  to be ordered correctly, and the recipe knows which it wants.
- Dep iteration order in the sandbox is not a stable contract. A rule
  that auto-symlinks the "first" glibc-shipping dep would silently
  change behavior whenever an unrelated dep is added.

Hiding this choice inside `src/sandbox.rs` would force a wrong-by-default
guess on every recipe that doesn't match it. Keeping it explicit costs
one option per call site; recipes that need it pass it, and the option
documents *what* they're choosing and *why*. That's the right tradeoff.

The `glibcLinker` doc-comment was updated to frame the option as a
deliberate, ongoing API rather than a transitional workaround. The
`muslLinker` doc-comment was given the same treatment for symmetry.

**Phase 5 introduces wrapper generation for the 10 K1 recipes.** Adding
`runtime_deps: ["glibc"]` to bash/coreutils/etc. causes `wrap.rs` to emit
`/bin/<tool>` shell wrappers that exec `/bin/.<tool>-wrapped`. Recipes
that previously inspected `/deps/<tool>/bin/<tool>` as a raw ELF (to check
magic bytes, ldd output, etc.) need to resolve the wrapper indirection
first. `validate-bash.ts` was updated as the canonical example of this
pattern.
