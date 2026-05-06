**ARCHIVED:** This plan is superseded by `plans/bootstrap-roadmap.md` (the single source of truth). This file is kept for historical reference only.

# Plan: Migrate Downstream Recipes to hod-seed-root

**Status:** Edits done + bootstrap ladder fixes applied. Blocked on gcc-musl rebuild (~30 min).
**Goal:** Switch all non-ladder recipes from `seedRootRecipe` (pre-built musl.cc) to `hodSeedRootRecipe` (Hod-built musl toolchain from source), so the downstream pipeline is fully auditable.

**Prerequisite:** Phases 1–4 of `plans/build-musl-from-source.md` are complete. The Hod-built musl toolchain (musl 1.2.5 + binutils 2.37 + gcc 11.2.0) is validated and produces correct C and C++ binaries.

## Progress Summary for Next Session

### What was done

1. **All 34 downstream recipe files migrated** (Groups 1–5): each changed from `seedRootRecipe` → `hodSeedRootRecipe` in both import and dep lines. No other changes to build scripts, flags, or dependencies. Verified: zero files reference both; ladder files untouched.

2. **First validation attempt (gcc-stage1 + glibc) revealed two issues:**

   **Issue A: Missing `ld.bfd` symlink in hod-seed-root.**
   The Hod-built binutils produced `x86_64-linux-musl-ld` but not the unprefixed `ld.bfd` symlink that glibc's configure checks for. Fixed in `recipes/bootstrap/binutils-musl.ts` by adding unprefixed `ld.bfd` and `ld.gold` symlinks to match the musl.cc layout.

   **Issue B: glibc build fails with "hidden symbol `atexit' referenced by DSO".**
   After fixing Issue A, glibc's `make` fails at `support/links-dso-program` with a linker error. This does NOT happen with the musl.cc toolchain. Root cause: the musl.cc gcc is built with `--disable-gnu-indirect-function`, which our gcc-musl lacked. Added this flag to `recipes/bootstrap/gcc-musl.ts`.

3. **Bootstrap ladder cascade triggered.** Both fixes change bootstrap ladder recipes (binutils-musl, gcc-musl), so the full ladder must be rebuilt: binutils-musl → gcc-musl → hod-musl-toolchain → hod-seed-root → all downstream.

### What needs to happen next

1. **Rebuild gcc-musl** with the `--disable-gnu-indirect-function` flag added. The hash was `c828c6ac...` but the build was aborted before completion. The gcc build takes ~30 minutes.
   ```
   hod build --hash <new-gcc-musl-hash>
   ```

2. **Rebuild hod-musl-toolchain** (assembly recipe, fast ~3 min):
   ```
   hod build --hash <new-hod-musl-toolchain-hash>
   ```

3. **Rebuild hod-seed-root** (assembly recipe, fast ~1.5 sec):
   ```
   hod build --hash <new-hod-seed-root-hash>
   ```

4. **Validate glibc build with new hod-seed-root.** This is the critical test — if glibc builds successfully, the rest of the pipeline should work:
   ```
   # Evaluate and get hash
   bun run recipes/cross/glibc.ts
   hod build --hash <glibc-hash>
   ```

5. **Continue with the original migration plan Steps 1–5** (build gcc-stage1, native tools, stage2, toolchain assembly).

### Commands to pick up where we left off

```bash
# Enter dev shell
nix develop --accept-flake-config --command bash -c '
export PATH=$PWD/target/release:$PATH
export HOD_BIN=$PWD/target/release/hod

# Step 1: Re-evaluate changed bootstrap recipes
bun run recipes/bootstrap/binutils-musl.ts
bun run recipes/bootstrap/gcc-musl.ts
bun run recipes/bootstrap/hod-musl-toolchain.ts
bun run recipes/bootstrap/hod-seed-root.ts

# Step 2: Get hashes
bun -e "
import { binutilsMuslRecipe } from \"./recipes/bootstrap/binutils-musl.js\";
import { gccMuslRecipe } from \"./recipes/bootstrap/gcc-musl.js\";
import { hodMuslToolchainRecipe } from \"./recipes/bootstrap/hod-musl-toolchain.js\";
import { hodSeedRootRecipe } from \"./recipes/bootstrap/hod-seed-root.js\";
console.log(\"binutils-musl:\", binutilsMuslRecipe.hash);
console.log(\"gcc-musl:\", gccMuslRecipe.hash);
console.log(\"hod-musl-toolchain:\", hodMuslToolchainRecipe.hash);
console.log(\"hod-seed-root:\", hodSeedRootRecipe.hash);
"

# Step 3: Build (binutils-musl already cached from this session)
# gcc-musl is the slow one (~30 min)
hod build --hash <gcc-musl-hash>
hod build --hash <hod-musl-toolchain-hash>  # ~3 min
hod build --hash <hod-seed-root-hash>        # ~2 sec

# Step 4: Validate glibc
bun run recipes/cross/glibc.ts
hod build --hash <glibc-hash>
'
```

### Files changed this session

| File | Change | Why |
|------|--------|-----|
| 34 downstream recipes (Groups 1–5) | `seedRootRecipe` → `hodSeedRootRecipe` | The actual migration |
| `recipes/bootstrap/binutils-musl.ts` | Added unprefixed `ld.bfd` and `ld.gold` symlinks | Match musl.cc layout; glibc configure needs `ld.bfd` |
| `recipes/bootstrap/gcc-musl.ts` | Added `--disable-gnu-indirect-function` to configure | Match musl.cc; fixes glibc "hidden symbol atexit" linker error |

### Important context for the `--disable-gnu-indirect-function` decision

IFUNC (GNU Indirect Function) is a glibc feature where the dynamic linker picks the best implementation of a function at startup (e.g., AVX2 `memcpy` on modern CPUs). The musl.cc toolchain disables it because musl doesn't use IFUNC. Our seed gcc is a musl toolchain, so disabling IFUNC in its runtime is appropriate.

**This does NOT affect the final toolchain.** The pipeline builds three compilers:
1. `gcc-musl` (seed, musl target) — the one we changed. Build tool only.
2. `gcc-stage1` (cross-compiler, musl→glibc target) — built BY gcc-musl, but configured independently.
3. `gcc-stage2` (native glibc compiler) — the one that goes into `native-toolchain` and compiles all downstream software. Has its own configure flags.

The `--disable-gnu-indirect-function` flag only affects gcc-musl's own runtime libraries. gcc-stage2 will have IFUNC support if its configure detects it (it should — it targets glibc).

**Open question (low priority):** Is the `atexit` linker error purely an IFUNC issue, or does it indicate a deeper difference in how our binutils was built? The pragmatic fix works, but a future investigation could compare the musl.cc binutils configure flags with ours for completeness.

### Build already completed and cached this session

These builds succeeded and their outputs are in the store:
- binutils-musl (with `ld.bfd` fix): hash `46e0ebfb...`, output `42128b89...`
- hod-musl-toolchain (old gcc-musl, before IFUNC fix): hash `1c1016e2...`, output `97913b0a...`
- hod-seed-root (old gcc-musl, before IFUNC fix): hash `8a5a9915...`, output `6f9aa971...`
- glibc with old seed-root (musl.cc, as control): hash `78acec93...`, output `9b53c774...` — **succeeded**

These are now stale because gcc-musl changed. The new ladder needs rebuilding from gcc-musl onward.

## Context: Two-Tier Seed Architecture

The pipeline has two seed roots with identical output layouts:

| | `seed-root.ts` | `hod-seed-root.ts` |
|---|---|---|
| **Toolchain** | musl.cc download (opaque) | Hod-built (musl + binutils + gcc from source) |
| **Used by** | Bootstrap ladder only | Everything downstream |
| **Why separate** | Avoids circular dependency | Full source auditability |

See `docs/bootstrap-pipeline.md` for the full architecture.

## Bootstrap Ladder (MUST stay on seed-root)

These recipes form a dependency cycle if hod-seed-root is used, because the
Hod-built toolchain depends on them:

```
shims/make.ts
shims/sed.ts
shims/patch.ts
shims/gawk.ts
shims/m4.ts
shims/bison.ts
shims/shims-bundle.ts
cross/gmp.ts
cross/mpfr.ts
cross/mpc.ts
bootstrap/musl-build.ts
bootstrap/binutils-musl.ts
bootstrap/gcc-musl.ts
bootstrap/hod-musl-toolchain.ts
bootstrap/hod-seed-root.ts
bootstrap/validate-musl-build.ts
bootstrap/validate-binutils-musl.ts
bootstrap/validate-gcc-musl.ts
bootstrap/validate-hod-seed-root.ts
```

Also anything that depends on the ladder recipes through shims-bundle
(the cross/ gmp/mpfr/mpc recipes use shims-bundle, so they're in the
ladder even though gcc-stage1 isn't).

## Migration Targets (switch to hod-seed-root)

### Group 1: Cross-compilation recipes (Stage 1)

These use `shims-bundle` (which stays on seed-root) but import `seedRootRecipe`
directly for their executor/compiler. They can switch to `hodSeedRootRecipe`
because they are not in the bootstrap ladder's dependency chain.

- [x] `cross/gcc-stage1.ts`
- [x] `cross/glibc.ts`
- [x] `cross/glibc-runtime.ts`
- [x] `cross/linux-headers.ts`
- [x] `cross/validate-stage1.ts`
- [x] `cross/validate-complex.ts`
- [x] `cross/run-packed-hello.ts`

### Group 2: Stage 2 native tools

- [x] `native/binutils.ts`
- [x] `native/bash.ts`
- [x] `native/coreutils.ts`
- [x] `native/make.ts`
- [x] `native/sed.ts`
- [x] `native/grep.ts`
- [x] `native/gawk.ts`
- [x] `native/patch.ts`
- [x] `native/tar.ts`
- [x] `native/diffutils.ts`
- [x] `native/findutils.ts`
- [x] `native/validate-bash.ts`
- [x] `native/validate-reloc.ts`
- [x] `native/validate-selfhost.ts`
- [x] `native/ncurses/debug.ts`
- [x] `native/ncurses/debug-toolchain.ts`

### Group 3: Stage 2.5 (gcc-stage2)

- [x] `stage2/gmp.ts`
- [x] `stage2/mpfr.ts`
- [x] `stage2/mpc.ts`
- [x] `stage2/gcc-stage2.ts`
- [x] `stage2/gcc-stage2-c.ts`
- [x] `stage2/validate-gcc-stage2.ts`
- [x] `stage2/validate-gcc-stage2-c.ts`

### Group 4: Toolchain assembly

- [x] `toolchain/busybox-native.ts`
- [x] `toolchain/native-toolchain.ts`

### Group 5: Bootstrap recipes not in the ladder

- [x] `bootstrap/python-install.ts`
- [x] `bootstrap/validate-seed.ts`

## Migration Steps

### Step 0: Rebuild bootstrap ladder — IN PROGRESS

The gcc-musl and binutils-musl recipes were modified to match the musl.cc
toolchain's output layout and configure flags. The full ladder must be
rebuilt before downstream validation can proceed.

- [x] Fix `binutils-musl.ts` (add `ld.bfd`, `ld.gold` symlinks)
- [x] Fix `gcc-musl.ts` (add `--disable-gnu-indirect-function`)
- [x] Build binutils-musl (cached)
- [ ] Build gcc-musl (~30 min, was aborted)
- [ ] Build hod-musl-toolchain
- [ ] Build hod-seed-root
- [ ] Validate: build glibc with new hod-seed-root

### Step 1: Migrate Group 1 (cross/) — EDITS DONE, NEEDS VALIDATION

- [ ] Build `cross/gcc-stage1.ts` with the Hod-built seed
- [ ] Run `cross/validate-stage1.ts` — must pass
- [ ] Run `cross/validate-complex.ts` — must pass

### Step 2: Migrate Group 2 (native/) — EDITS DONE, NEEDS VALIDATION

- [ ] Build each native tool — all should be cache-miss but fast
- [ ] Run `native/validate-bash.ts`, `native/validate-selfhost.ts`

### Step 3: Migrate Group 3 (stage2/) — EDITS DONE, NEEDS VALIDATION

- [ ] Build stage2 gmp, mpfr, mpc, then gcc-stage2
- [ ] Run `stage2/validate-gcc-stage2.ts`

### Step 4: Migrate Group 4 (toolchain/) — EDITS DONE, NEEDS VALIDATION

- [ ] Build native-toolchain — this is the final assembly
- [ ] Verify downstream packages (ncursions, cbonsai) still build

### Step 5: Migrate Group 5 (misc bootstrap) — EDITS DONE, NEEDS VALIDATION

- [ ] Build validate-seed, python-install

### Step 6: Validate the full pipeline

- [ ] Build from hod-seed-root through to native-toolchain
- [ ] Build ncursions and cbonsai with the final toolchain
- [ ] Verify all output hashes are consistent

### Step 7: Update documentation

- [ ] Update `docs/bootstrap-pipeline.md` executor/compiler evolution tables
- [ ] Update `AGENTS.md` if needed
- [ ] Close out this plan

## Mechanical Change Pattern

Each migration is a two-line change:

```diff
- import { seedRootRecipe } from "../bootstrap/seed-root.js";
+ import { hodSeedRootRecipe } from "../bootstrap/hod-seed-root.js";

  // in dependencies array:
- dep("seed", seedRootRecipe),
+ dep("seed", hodSeedRootRecipe),
```

No changes to build scripts, flags, or other dependencies.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| gcc 11.2.0 vs 11.2.1 produces different code | Downstream hashes change, possible miscompilation | Patch-level difference should be safe. Run full validation suite. |
| Hod-built gcc has different default flags | Configure scripts may detect different features | Both use `--enable-default-pie --enable-default-ssp`. Compare `gcc -v` output. |
| Build times increase | gcc-stage1 rebuild takes ~30 min, gcc-stage2 ~1-2 hrs | Expected. Only happens once per migration. |
| musl.cc gcc has patches not in upstream 11.2.0 | Missing features or ABI differences | The musl.cc build is 11.2.1 (a snapshot). Check for musl-specific patches in their repo if issues arise. |

## Not In Scope

- Migrating bootstrap ladder recipes (they must stay on seed-root)
- Building busybox from source (separate plan)
- Round-trip reproducibility testing (depends on this migration)
- Changing compilers from gcc-stage1 to gcc-stage2 in native recipes (separate concern)
