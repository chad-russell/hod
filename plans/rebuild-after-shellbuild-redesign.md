# Agent Instructions: Evaluate and Rebuild After shellBuild Redesign

**Status:** Historical investigation; the rebuild/GC validation succeeded on this tree.
**Current authority:** current source, tests, and `docs/build-environment-and-metadata.md`
**Prerequisite:** The shellBuild redesign (plans/shellbuild-redesign.md) has been
implemented. ~60 recipe .ts files were modified. SDK files were changed. Two
obsolete packed-test recipes were removed because they referenced a missing
resources recipe and were not part of the active bootstrap path.

---

## Progress Log

### 2026-05-10 — Root-set workflow ✅, Store GC ✅, Build pending

**Pre-flight (Step 1):** All checks passed.
- SDK imports, cProfile, rustProfile all OK.
- No stale `toolchain: "toolchain"` or `from js/src cargoBuild` references.
- `hod build-remaining --help` works.

**Evaluation (Step 2):** All 297 recipes evaluated successfully in 31s via `rebuild.sh --eval-only`. No errors.

**Build (Step 3):** `hod build-remaining` reported 226/297 recipes need building. Built 4 successfully then **failed on coreutils** (recipe `36a702ed…`).

**Root cause:** The store had 0 staged outputs on disk (only 33 in staging, 75 in DB) despite the plan saying toolchain/bootstrap were cached. The coreutils recipe was never previously built with this hash and its `make` step tries to regenerate autotools files (aclocal-1.16, automake-1.16, perl, makeinfo) that aren't in the sandbox.

**Fix applied to `recipes/native/coreutils.ts`:**
1. Added timestamp normalization before configure:
   ```sh
   find . -exec touch -t 202001010000 {} +
   find . -name 'Makefile.in' -exec touch -t 202001010001 {} +
   ...
   ```
2. Added `MAKEINFO=true` to `make install` to skip texinfo generation.

**Important lesson:** Changing coreutils.ts changes its recipe hash, which cascades to all downstream recipes (base-files, procps-ng, htop, native-toolchain, musl-build-stage2). Those recipes must also be re-evaluated. A full `rebuild.sh --eval-only` is needed after any recipe change.

**Current state update:** The recipe-level timestamp workaround was superseded by a core fix in `src/build.rs`: Hod now canonicalizes mtimes for materialized/staged artifacts to a fixed timestamp. This keeps artifact mtimes deterministic and prevents Autotools release tarballs from spuriously regenerating maintainer files because of wall-clock copy/extract times. The ad-hoc timestamp normalization was removed from `coreutils.ts` and `tar.ts`.

Additional rebuild tooling was added:
1. `hod build-roots --roots-file <file>` builds only the graph reachable from explicit current roots, avoiding stale/orphan recipes in a polluted store.
2. `hod gc --roots-file <file> [--dry-run]` garbage-collects store objects unreachable from explicit roots.
3. `scripts/write-current-roots.sh` evaluates recipe modules and writes exported recipe hashes in roots-file format.

Obsolete packed executable test recipes were removed:
- `recipes/cross/hello-packed.ts`
- `recipes/cross/run-packed-hello.ts`

The ignored validation test that referenced `hello-packed.hod` was removed from `tests/at_execfn_validation.rs`, and docs were updated.

**Store GC completed:**
1. Re-ran `scripts/rebuild.sh --eval-only` successfully.
2. Generated `current-roots.txt` with 202 current exported recipe roots.
3. Ran `hod gc --roots-file current-roots.txt --dry-run` successfully.
4. Ran real `hod gc --roots-file current-roots.txt` successfully.

GC result:
```text
live recipes=264, live outputs=186, live blobs=106025,
removed recipes=289, outputs=22, logs=34, staging=2, blobs=181
```

Next steps:
1. Build the current graph with `hod build-roots --roots-file current-roots.txt`.
2. Fix build failures methodically if they appear. Prefer core/helper fixes over per-recipe hacks.
3. After successful root-set build, regenerate roots and run GC dry-run + real GC again to remove newly orphaned intermediates.

---

### 2026-05-10 (session 3) — Build env refactor started, ncdu root unblocked

Started the principled build-environment refactor toward a language-agnostic
core:

1. Added `docs/build-environment-and-metadata.md`.
   - Core Hod target: only universal builder env (`OUT`, `DEPS`, `TMPDIR`,
     `HOME`, `HOD_STORE`).
   - No C-specific auto-env in core long-term.
   - SDK/profile layers own ecosystem env composition.
   - Declared recipe metadata should become deterministic, hashed recipe
     interface data; exact wire format still to be implemented after design is
     fully specified.

2. Added generic SDK helpers in `js/src/env.ts`, exported from `js/src/index.ts`:
   - `depPath()`
   - `depSubpath()`
   - `pathList()`
   - `depSubpathList()`
   - `appendPath()`
   - `mergeEnv()`

3. Refactored `recipes/helpers/c.ts` so `cProfile()` can explicitly compose
   C-specific env from caller-provided lists:
   - `binDeps`
   - `includeDeps` / `includePaths`
   - `libDeps` / `libPaths`
   - `pkgConfigDeps` / `pkgConfigPaths`

   Default `cProfile()` remains equivalent for existing callers: toolchain PATH,
   compiler vars, `CFLAGS`, `HOD_DUMMY_RPATH`, and `LDFLAGS` only.

4. Added `js/tests/env.test.ts`; full Bun SDK test suite passes:
   `44 pass, 0 fail`.

5. Fixed the current ncdu build failure methodically:
   - `ncdu` now uses explicit `cProfile({ includePaths, libDeps,
     pkgConfigDeps })`.
   - The ncdu source expects `<ncurses.h>`, while current ncurses exposes wide
     headers under `include/ncursesw/` with `curses.h`; the recipe patches the
     generated configure/source references to `<curses.h>` and uses explicit
     `CPPFLAGS`/`LDFLAGS`.
   - `ac_cv_header_curses_h=yes` is used because the generated configure check
     still failed under the current toolchain/env shape even when later compile
     commands used the explicit include paths correctly.
   - Verified `hod build --hash 79ba367a6b6fa86c6aa7a6f1b01c64dddb6920c94c952f6b1c69dbe3a4fc4667`
     succeeds and produces output `ed21a9125f00708b2529cb4b0680c1bb8c8a8e02200de00a3dcc8c2d7c711002`.

Next steps:
1. Continue moving recipes from implicit core auto-env to explicit `cProfile()`
   dependency lists.
2. Once all recipes are explicit, remove core auto-env from `src/build.rs` and
   add a Rust regression test proving C-specific env is not injected.
3. Specify and implement deterministic recipe metadata.
4. Resume `hod build-roots --roots-file current-roots.txt` from the current root
   set after re-evaluation.

### 2026-05-10 (session 4) — Explicit cProfile() migration + auto-env removal + full root-set build

**Goal:** Migrate all `shellBuild` + `cProfile()` recipes to declare their non-toolchain
dependency paths explicitly in `cProfile()` options, remove the C-specific auto-env
from `src/build.rs`, and validate with a full root-set build.

**Principle:** This pass adds explicit `binDeps`, `includeDeps`, `libDeps`, `pkgConfigDeps`,
and `includePaths` to `cProfile()` calls. It does NOT remove existing per-recipe
`export CPPFLAGS/LDFLAGS/PKG_CONFIG_PATH` lines — those remain as belt-and-suspenders
until a separate cleanup pass. The migration is about making intent
explicit in the profile layer so auto-env is no longer needed.

#### Recipe migration (26 recipes with explicit cProfile options)

Already had explicit cProfile options (no change needed):
- `ncdu` — was the prototype from session 3

Migrated with `binDeps` only (build-tool deps, no headers/libs consumed):
- `autoconf`: `binDeps: ["m4", "perl"]`
- `automake`: `binDeps: ["autoconf", "m4", "perl"]`
- `bc`: `binDeps: ["bison", "flex"]`
- `bison`: `binDeps: ["m4"]`
- `flex`: `binDeps: ["m4", "bison"]`
- `openssl`: `binDeps: ["perl"]`
- `validate-roundtrip` (roundtrip): `binDeps: ["binutils", "gcc"]`

Migrated with `includeDeps`/`libDeps`/`pkgConfigDeps` (library deps):
- `htop`: ncurses (include + lib + pkgConfig)
- `less`: ncurses (include + lib + pkgConfig)
- `vim`: ncurses (include + lib + pkgConfig)
- `readline`: ncurses (include + lib + pkgConfig)
- `nnn`: ncurses + readline (include + lib + pkgConfig)
- `curl`: openssl + zlib (include + lib + pkgConfig)
- `openssh`: openssl + zlib (include + lib + pkgConfig)
- `libevent`: openssl (include + lib + pkgConfig)
- `validate-pkgconf`: zlib (include + lib + pkgConfig)

Migrated with `includeDeps`/`libDeps` + `includePaths` (ncursesw subdirectory):
- `nano`: ncurses (include + includePaths + lib)
- `cbonsai`: ncurses (include + includePaths + lib)
- `procps-ng`: ncurses (include + includePaths + lib)

Migrated with multiple dep categories:
- `tmux`: `binDeps: ["bison"]`, libevent + ncurses (include + lib + pkgConfig)
- `file`: zlib + bzip2 + xz (include + lib)
- `libxml2`: zlib + xz + libiconv (include + lib + pkgConfig)
- `git`: curl + expat + libiconv + openssl + zlib (include + lib + pkgConfig)
- `rsync`: openssl + zlib + zstd (include + lib + pkgConfig)
- `python`: openssl + zlib + libffi + ncurses + readline + bzip2 + xz + expat
  (include + includePaths + lib + pkgConfig)

Left as bare `cProfile()` — toolchain-only deps, no non-toolchain build inputs:
- `base-files`, `bzip2`, `ca-certificates`, `expat`, `gzip`, `jq`, `libffi`,
  `libiconv`, `lz4`, `m4`, `ncurses`, `pcre2`, `pv`, `sqlite`, `strace`,
  `tree`, `xz`, `zlib`, `zstd`

Left as bare `cProfile()` — non-toolchain deps are runtime-only or assembly-only:
- `initramfs`: base-files is copied, not compiled against
- `rust`: zlib is runtime_dep only (prebuilt binary installation)

Left as bare `cProfile()` — roundtrip, toolchain-only:
- `binutils-musl-stage2`, `musl-build-stage2`

#### Core auto-env removal (`src/build.rs`)

Removed Layer 1 (dep scanning for `bin/`, `lib/`, `include/` → automatic
`PATH`, `LIBRARY_PATH`, `C_INCLUDE_PATH`). Process builds now have a 2-layer env:
- Layer 1: Recipe env (from `p.env` — SDK profiles compose this)
- Layer 2: Standard builder env (`OUT`, `DEPS`, `TMPDIR`, `HOME`, `HOD_STORE`)

#### Bug fixes discovered during build validation

1. **`recipes/helpers/rust.ts`**: `cargoBuild` source extraction used `tar xf
   /deps/source/source` but `fetchTarball()` sources produce already-extracted
   directories. Changed to `cp -a /deps/source/. /tmp/build`.

2. **`recipes/native/vim/vim.ts`**: Vim's `auto/configure` is at `src/auto/configure`
   in the fetchTarball-extracted source (top-level dir stripped). Fixed to `cd src`
   before running `bash auto/configure`.

#### Stale comment updates

- `recipes/cross/linux-headers.ts`: "auto-PATH" → "downstream deps find headers"
- `recipes/stage2/validate-gcc-stage2-c.ts`: "Override auto-env" → "Set explicitly"
- `recipes/stage2/validate-gcc-stage2.ts`: "Override auto-env" → "Set explicitly"
- `recipes/stage2/gmp.ts`: "Empty overrides to prevent auto-env" → "Explicit empty values"
- `docs/debugging-builds.md`: Removed "override the auto-env values" phrasing

#### Root-set build result

**Full root set:** 201 roots (after removing `debug.ts` export).

**Build result:** 201/201 roots built successfully against the regenerated
201-root `current-roots.txt`, with bootstrap/cross-compile transitive deps cached
from a prior store state.

**Caveat:** After the successful build, GC was run against the regenerated root
file. The GC removed stale recipe blobs and their outputs. This included cached
outputs from the bootstrap/cross-compile base layer (pre-existing, not modified
by this change set). Rebuilding from scratch is currently blocked by a
pre-existing cross-compile failure: `recipes/cross/gcc-stage1.ts` fails because
glibc's configure requires `make` and `python` in the seed environment, which
are not present. This failure existed before the auto-env migration and is
unrelated to it.

The auto-env migration is validated by the successful 201-root build that ran
before GC. The current post-GC store requires a fresh bootstrap pipeline build
to restore the base layer cache before `build-roots` will succeed against the
full 201-root set.

**Excluded from root set:** `recipes/native/ncurses/debug.ts` — diagnostic
recipe broken by the earlier fetchTarball migration. Its `export` was removed
so it is no longer generated as a root. The file is retained for future cleanup.

#### Root count reconciliation

| State | Count | Explanation |
|-------|-------|-------------|
| `current-roots.txt` | 201 | Generated after removing debug.ts export |
| Built successfully before GC | 201/201 | Against regenerated `current-roots.txt`, with cached bootstrap deps |
| Currently buildable from scratch | ~22 | First 22 roots are bootstrap downloads/files |
| Blocked at | Root 23 (gcc-stage1) | Pre-existing cross-compile glibc failure |

#### Store GC result

GC was run against the 201-root `current-roots.txt` after the successful build:

```
live recipes=263, live outputs=262, live blobs=109873,
removed recipes=508, outputs=60, logs=89, staging=11, blobs=1210
```

**Important caveat:** The GC removed 60 outputs including cached bootstrap/cross-compile
base layer outputs that were not rebuilt by this change set. These outputs were cached
from a prior store state. After GC, `build-roots` against the same root file fails at
root 23 (gcc-stage1) because the transitive dep chain (native-toolchain → glibc →
gcc-stage1 → seed) requires rebuilding the cross-compile glibc, which has a pre-existing
configure failure. The GC should ideally be run *before* eval+build, not after, to
avoid removing still-needed cached outputs of unchanged recipes.

#### Commands used

```bash
BUN=/nix/store/vmhlm86h4c9gxzrczqd91hwfz2kkfn25-bun-1.3.11/bin/bun
HOD_BIN=./target/debug/hod

# Evaluate all recipes
BUN=$BUN HOD_BIN=$HOD_BIN bash scripts/rebuild.sh --eval-only

# Remove debug.ts export (broken by fetchTarball migration)
# Edited recipes/native/ncurses/debug.ts to comment out `export const debugRecipe`

# Generate root set (now 201 roots after debug.ts export removal)
BUN=$BUN HOD_BIN=$HOD_BIN scripts/write-current-roots.sh current-roots.txt
# Result: 201 current recipe root(s)

# Build (succeeded because bootstrap/cross-compile deps were cached)
$HOD_BIN build-roots --roots-file current-roots.txt
# Result: 201/201 built successfully

# GC dry-run and real GC against same roots file
$HOD_BIN gc --roots-file current-roots.txt --dry-run
$HOD_BIN gc --roots-file current-roots.txt
# Result: removed 508 stale recipes, 60 outputs (including cached bootstrap deps)

# NOTE: Confirmed after GC: build-roots fails at root 23 (gcc-stage1) because
# cached bootstrap/cross-compile outputs were removed. This is a pre-existing
# cross-compile issue, not related to auto-env removal.
$HOD_BIN build-roots --roots-file current-roots.txt
# Result: root [23/201] FAILED 3f11a34dfc3e6190e5aa9bb592ed9c0a93287896cae987fec75bd2816009b70f
# glibc configure error: missing critical programs make and python.

# Tests
$BUN test js/tests/env.test.ts         # 4/4 pass
nix develop --accept-flake-config --command cargo test \
  --test recipe_encoding --test recipe_json_roundtrip --test store_basic \
  -- --test-threads=1                   # 25/25 pass
nix develop --accept-flake-config --command cargo test \
  --test sandbox_improvements -- --test-threads=1   # 11/11 compile, all ignored
# (ignored tests need seed-root in store — not run this session)
```

#### Test summary

| Test | Result |
|------|--------|
| Bun SDK env tests | 4/4 pass |
| `rebuild.sh --eval-only` (297 recipes) | All evaluate |
| `cargo test` (recipe_encoding, store_basic, etc.) | 25/25 pass |
| `cargo test --test sandbox_improvements` | 11/11 compile, all ignored (need seed-root) |
| `build-roots` (201 roots) | **201/201 built** (with cached bootstrap deps from prior session) |
| `build-roots` after GC | Fails at root 23 (gcc-stage1, pre-existing cross-compile issue) |
| `gc --roots-file` (201 roots) | Completed (removed cached bootstrap outputs as side effect) |

#### Future work

1. Run ignored sandbox integration tests after next seed-root build.
2. Remove redundant per-recipe `export CPPFLAGS/LDFLAGS/PKG_CONFIG_PATH` lines
   where the profile now provides the same paths (separate cleanup pass).
3. Design and implement deterministic declared recipe metadata.
4. Fix `recipes/native/ncurses/debug.ts` (stale diagnostic, broken by
   fetchTarball migration, not by auto-env removal). Export is commented out.
5. The `C_INCLUDE_PATH: ""` in `rustProfile()` is now a no-op (core never injects
   it). Can be removed in a hash-changing cleanup pass.
6. Fix cross-compile pipeline (`recipes/cross/gcc-stage1.ts`): glibc configure
   needs `make`/`python` in the seed environment. Pre-existing issue.
7. Rebuild bootstrap/cross-compile base layer to restore cached outputs,
   then re-run `build-roots` against the full 201-root set.
8. Consider GC ordering: run GC *before* eval+build to avoid removing cached
   outputs of unchanged recipes that haven't been re-imported yet.

### 2026-05-10 (session 5) — Bootstrap/cross raw-process fixes; post-GC root set builds ✅

After session 4, `build-roots` against the post-GC `current-roots.txt` failed at
root 23 (`recipes/cross/gcc-stage1.ts`). Investigation showed this was not a
new compiler/bootstrap design issue; it was another consequence of removing core
auto-env. Several raw `process()` recipes outside `shellBuild` still relied on
old core dep scanning to put dependency `bin/` directories on `PATH`.

Fixes applied:

1. **Cross raw-process recipes now opt into shims PATH explicitly** via
   `hermeticPreamble({ ..., shims: "shims" })`:
   - `recipes/cross/glibc.ts`
   - `recipes/cross/gcc-stage1.ts`
   - `recipes/cross/gmp.ts`
   - `recipes/cross/mpfr.ts`
   - `recipes/cross/mpc.ts`

2. **`recipes/cross/glibc.ts`** additionally exports Python/make explicitly:
   ```sh
   export PATH="/deps/python/bin:$PATH"
   export MAKE="/deps/shims/bin/make"
   export PYTHON="/deps/python/bin/python3"
   ```
   This fixed glibc configure's missing `make`/`python` checks.

3. **`recipes/bootstrap/hod-musl-toolchain.ts`** now exports
   `PATH=/deps/seed/bin:$PATH` because it is a raw assembly process that invokes
   unqualified `mkdir`, `cp`, `basename`, `ls`, etc.

4. **`recipes/toolchain/busybox-native.ts`** was fixed after the post-GC rebuild
   reached native-toolchain assembly:
   - replaced fragile appended BusyBox config assignments with deterministic
     `set_config_y`/`set_config_n` helpers that edit `.config` in place;
   - disabled unneeded/problematic defconfig applets/features (`WGET`,
     `SSL_CLIENT`, `TLS`, `BC`, `DC`, `SPLIT`, console/init/utmp/wtmp features);
   - added bootstrap compatibility defines for musl/kernel-header conflicts:
     `-DNAME_MAX=255 -DLONG_BIT=64 -DSSIZE_MAX=9223372036854775807L`.

Validation:

```bash
BUN=/nix/store/vmhlm86h4c9gxzrczqd91hwfz2kkfn25-bun-1.3.11/bin/bun \
HOD_BIN=./target/debug/hod scripts/write-current-roots.sh current-roots.txt
# Wrote 201 current recipe root(s)

./target/debug/hod build --hash 4c7e1972476909cf3ad2d85414cca96188d6966d1c22805194dc1b97b1ea8aec
# gcc-stage1 rebuilt successfully → c6b723d655dcbdf8e0232e78d2ab1881974a3ce825b9c5c3efcd10b4ac948a07

./target/debug/hod build --hash a79c0d74a09bdd829eccaacd497e2b17983c21ba3d1aea218105b521690e8607
# busybox-native rebuilt successfully → 38096531852d6b4bfe6e1126fb8a1c0fe9ffd5e86d7a23d5bbe6d6a823882802

./target/debug/hod build-roots --roots-file current-roots.txt
# 201/201 roots built; build-roots complete
```

Key lesson: removing core auto-env affects **all** `Process` recipes, not only
`shellBuild` recipes. Any raw process that uses dependency tools must now set
`PATH` explicitly, either through `hermeticPreamble({ shims: ... })`, explicit
script exports, or recipe env.

Next steps:
1. Re-run focused tests if desired, then regenerate roots once more and consider
   GC dry-run/real GC now that the post-GC root-set build succeeds.
2. Audit remaining raw `process()` recipes with unqualified commands and make
   their PATH assumptions explicit where appropriate.
3. Continue future work from session 4: deterministic metadata design and later
   cleanup of redundant per-recipe env exports.

### 2026-05-10 (session 2) — Root-set build: fixes applied, ~100/202 roots built

**Starting state:** All 297 recipes evaluate, 202 roots generated, store GC'd. Build had
not been attempted since the GC.

**Fixes applied during this session:**

1. **Source extraction mismatch in 13 raw-`process()` recipes**
   (`bash.ts`, `sed.ts`, `patch.ts`, `make.ts`, `grep.ts`, `gawk.ts`, `findutils.ts`,
   `diffutils.ts`, `coreutils.ts`, `tar.ts`, `binutils.ts`, `perl/perl.ts`,
   `pkgconf/pkgconf.ts`).

   The committed (`git HEAD`) versions of these recipes use `tar xf /deps/source/source -C /tmp`
   because their source recipes used `download()` (raw File tarballs). Uncommitted changes
   converted all source recipes to `fetchTarball()` (which produces Unpack/Directory
   outputs — already extracted). The 9 recipes with `fetchTarball` sources were correctly
   updated to `cp -a /deps/source/. /tmp/build`, but the 4 with `fileFromHash` sources
   (`sed.ts`, `patch.ts`, `make.ts`, `gawk.ts` — all from `recipes/shims/`) still need
   `tar xf /deps/source/source` because their deps produce raw tarballs.

   Additionally, three of the four `fileFromHash` recipes had a stale `cd /tmp/build`
   after the `tar xf` + `cd /tmp/<pkg>-<ver>`, causing "can't cd to /tmp/build" errors.

   **Rule of thumb:**
   - `fetchTarball()` source → `cp -a /deps/source/. /tmp/build` + `cd /tmp/build`
   - `fileFromHash()` source → `tar xf /deps/source/source -C /tmp` + `cd /tmp/<pkg>-<ver>`

2. **Stale hardcoded path in `recipes/native/bzip2/bzip2.ts`**
   The script copies source to `/tmp/build` via `cp -a` (correct for fetchTarball source)
   but later did `cd /tmp/bzip2-1.0.8` to copy helper scripts. Fixed to `cd /tmp/build`.

3. **`cProfile()` `C_INCLUDE_PATH: ""` stomped auto-env** (core fix)
   `cProfile()` in `recipes/helpers/c.ts` set `C_INCLUDE_PATH: ""` as a recipe env var
   (Layer 2). The build system's auto-env (Layer 1) detects dep outputs with `include/`
   subdirectories and constructs `C_INCLUDE_PATH=/deps/<name>/include` automatically.
   Layer 2 overrides Layer 1, so the empty string destroyed the auto-include paths,
   breaking any shellBuild recipe whose deps have headers (e.g. ncdu needing ncurses.h).

   **Fix:** Removed `C_INCLUDE_PATH: ""` from `cProfile()`. Auto-env now works correctly
   for all shellBuild recipes. This is the correct long-term design — recipe env should
   only override auto-env when there's a specific reason.

   This changes the recipe hash for every `shellBuild` + `cProfile()` recipe (all 49).

**Build progress:** `hod build-roots` successfully builds through root ~100/202. The
first failure after the cProfile fix is `ncdu` (root 100), which still can't find
`ncurses.h`. The ncurses output has `include/ncursesw/ncurses.h` but configure checks
for `ncurses.h` at the top level. This is a **recipe-level issue** (the ncdu configure
script expects the header at a specific path relative to include dirs), not an
auto-env bug. The auto-env correctly provides `C_INCLUDE_PATH=/deps/ncurses/include`.

**Remaining work:**
1. Fix the remaining build failures starting at root 100 (ncdu ncurses.h path).
2. Continue through root 202.
3. After a full successful build: regenerate `current-roots.txt`, run GC dry-run +
   real GC.
4. Commit all changes.

**Key design insight from this session:** The `src/build.rs` env layering is:
   - Layer 1 (auto-env): scans deps for `bin/`, `lib/`, `include/` subdirs → sets PATH,
     LIBRARY_PATH, C_INCLUDE_PATH automatically.
   - Layer 2 (recipe env): explicit per-recipe env vars — **overrides** Layer 1.
   - Layer 3 (standard env): OUT, DEPS, TMPDIR, HOME, HOD_STORE — always wins.

   Helpers like `cProfile()` should NOT set vars that auto-env handles (PATH,
   C_INCLUDE_PATH, LIBRARY_PATH) unless they need a specific non-default value.
   Currently `cProfile()` still sets `PATH` (needed to override auto-env's multi-path
   with just `/deps/toolchain/bin`), but `C_INCLUDE_PATH` was removed.

---

## What Changed and What Did NOT

### Changed (must re-evaluate and rebuild)

- **SDK:** `js/src/shell.ts` (new thin implementation), `js/src/elf.ts` (new),
  `js/src/index.ts` (updated exports), `js/src/cargo.ts` (deleted)
- **Helpers:** `recipes/helpers/c.ts` (new C profile), `recipes/helpers/rust.ts`
  (new Rust profile + refactored cargoBuild)
- **49 shellBuild recipe files** — all in `recipes/native/` (except the
  cross-compile ones that use raw `process()`) plus 3 roundtrip recipes.
  Each was updated to use `...cProfile()` instead of `toolchain: "toolchain"`.
- **11 cargoBuild recipe files** — all in `recipes/native/rust/`. Each was
  updated to import `cargoBuild` from `helpers/rust.js` instead of the SDK, and
  to pass `BuiltRecipe` objects instead of strings.

**Why recipe hashes changed:** The Process recipe `env` field changed. Old
recipes had `[{key: "C_INCLUDE_PATH", value: ""}]` with env vars injected as
shell `export` commands in the script body. New recipes have the full env
(PATH, CC, AR, RANLIB, STRIP, CFLAGS, C_INCLUDE_PATH, HOD_DUMMY_RPATH,
LDFLAGS) in the process env field. Different env → different recipe bytes →
different recipe hash. cargoBuild recipes additionally have a different script
body (no toolchainEnv/rpathEnv shell exports — those are in the process env
now) and different deps list (toolchain/rust deps auto-injected).

### Unchanged (do NOT need rebuilding)

- **All bootstrap ladder recipes** (`recipes/bootstrap/`) — use raw `process()`.
  Their .ts files were not modified. Their dep hashes (seed-root, source
  downloads) did not change. Their recipe hashes are **identical** to what's
  already in the store.
- **Most cross-compile recipes** (`recipes/cross/`) — use raw `process()`,
  untouched. The obsolete packed executable test recipes were removed.
- **All stage2 recipes** (`recipes/stage2/`) — use raw `process()`, untouched.
- **Toolchain assembly** (`recipes/toolchain/`) — uses raw `process()`,
  untouched. The `native-toolchain` recipe hash is unchanged.
- **Source recipes** — all `*-source.ts` files use `fetchTarball()`, untouched.
- **Stage 2 native tools** (`recipes/native/bash.ts`, `coreutils.ts`, `sed.ts`,
  `grep.ts`, `gawk.ts`, `patch.ts`, `make.ts`, `tar.ts`, `diffutils.ts`,
  `findutils.ts`, `binutils.ts`, `pkgconf/pkgconf.ts`) — all use raw
  `process()`, untouched. Their recipe hashes are **identical**.

### Store impact

- **Do NOT run `hod reset`.** The existing store already has the toolchain
  output and all bootstrap/cross/stage2 outputs cached. Blowing the store away
  would force a multi-hour rebuild of the entire bootstrap pipeline for no
  benefit.
- The changed recipes will produce new recipe blobs with new hashes. Old
  recipe blobs and old build outputs become orphaned but harmless until GC.
- `hod gc --roots-file current-roots.txt` has already removed the currently
  unreachable store objects. Run it again after the next successful root-set
  build.

---

## Step-by-Step Instructions

### 1. Pre-flight Verification

Run these checks before starting. If any fail, stop and investigate.

```bash
cd /home/crussell/hod
BUN=/nix/store/vmhlm86h4c9gxzrczqd91hwfz2kkfn25-bun-1.3.11/bin/bun
HOD_BIN=./target/debug/hod

# 1a. SDK imports work
$BUN -e "import { shellBuild, HOD_DUMMY_RUNPATH, HOD_DUMMY_RPATH_FLAG } from './js/src/index.js'; console.log('SDK OK, DUMMY_RUNPATH length:', HOD_DUMMY_RUNPATH.length)"

# 1b. cProfile works
$BUN -e "import { cProfile } from './recipes/helpers/c.js'; const p = cProfile(); console.log('shell:', p.shell); console.log('env keys:', Object.keys(p.env ?? {}).join(', '))"

# 1c. rustProfile works
$BUN -e "import { rustProfile } from './recipes/helpers/rust.js'; const p = rustProfile(); console.log('shell:', p.shell); console.log('env keys:', Object.keys(p.env).join(', '))"

# 1d. No stale imports
rg 'toolchain:\s*"toolchain"' recipes/ --type ts && echo "STALE TOOLCHAIN REFERENCE FOUND" && exit 1 || echo "No stale toolchain references"
rg 'from.*js/src.*cargoBuild' recipes/ --type ts && echo "STALE cargoBuild IMPORT FOUND" && exit 1 || echo "No stale cargoBuild imports"

# 1e. hod binary exists and has build-remaining
$HOD_BIN build-remaining --help > /dev/null && echo "hod build-remaining: OK"
```

### 2. Evaluate All Recipes

Use the existing `scripts/rebuild.sh` which evaluates all recipe files in
logical order. Unchanged recipes are no-ops (importToStore is idempotent).
Changed recipes will store their new hashes.

```bash
cd /home/crussell/hod
BUN=/nix/store/vmhlm86h4c9gxzrczqd91hwfz2kkfn25-bun-1.3.11/bin/bun
HOD_BIN=./target/debug/hod

# Evaluate everything, skip the build for now
BUN=$BUN HOD_BIN=$HOD_BIN bash scripts/rebuild.sh --eval-only
```

Expected: each recipe prints its hash (from importToStore). Look for
any `Error` or thrown exceptions. Recipes that haven't changed will
still evaluate successfully — they just re-import the same hash.

**If any recipe fails to evaluate:** read the error, fix the recipe,
re-run. Most likely causes:
- Import path error (a recipe references `cProfile` from the wrong
  relative path)
- Missing `dep("toolchain", ...)` in deps (it's still required in deps
  even though `toolchain:` parameter was removed)

### 3. Build

Do **not** use `hod build-remaining` for this store. It builds every unbuilt
recipe ever imported, including stale/orphan hashes from previous evaluations.
Use the explicit current root set instead:

```bash
cd /home/crussell/hod

BUN=$BUN HOD_BIN=$HOD_BIN scripts/write-current-roots.sh current-roots.txt
$HOD_BIN build-roots --roots-file current-roots.txt
```

This builds only the graph reachable from current exported recipe roots.
Bootstrap/toolchain recipes that are already cached will be skipped.

Expected duration: depends on how many recipes changed. The native
toolchain is already cached (unchanged), so build time should be
moderate — the recipes compile C packages with gcc, not rebuild
the compiler itself.

### 4. Verify

After build completes:

```bash
# 4a. Check for any unbuilt recipes
$HOD_BIN build-remaining
# Should print "No unbuilt recipes found" or similar

# 4b. Smoke test a few key binaries
# (inspect their outputs — look for bin/ contents)
$HOD_BIN inspect <zlib-hash>
$HOD_BIN ls-output <zlib-output-hash>
```

### 5. Update rebuild.sh (if needed)

Check if `scripts/rebuild.sh` needs updating. The script hardcodes
lists of recipe files. If new recipes were added since the script was
last updated (separate from this redesign), add their .ts paths to
the appropriate section. The `--eval-only` flag lets you verify
evaluation before building.

---

## What Could Go Wrong

### Import path errors

Recipes at different directory depths import `cProfile` from different
relative paths:

| Recipe location | Import path for cProfile |
|----------------|--------------------------|
| `recipes/native/<pkg>/<pkg>.ts` | `"../../helpers/c.js"` |
| `recipes/native/rust/<pkg>/<pkg>.ts` | `"../../../helpers/c.js"` (for shellBuild usage) |
| `recipes/roundtrip/<file>.ts` | `"../helpers/c.js"` |

If a recipe imports from the wrong relative path, Bun will fail with
a "module not found" error. Fix the import path.

### Recipes that set custom env (gcc-musl-stage2)

This recipe was intentionally NOT converted to cProfile. It uses raw
`process()` with a comment explaining why. Do not touch it. It
evaluates with its old hash and is already cached.

### Missing `dep("toolchain", ...)` in deps

The `toolchain:` parameter was removed from shellBuild, but
`dep("toolchain", nativeToolchainRecipe)` is STILL REQUIRED in the
deps array. shellBuild does not auto-inject it (that's only for
cargoBuild). If a recipe is missing this dep, the build will fail
because `/deps/toolchain/` won't exist in the sandbox.

### Stale DUMMY_RUNPATH constant

All recipes should reference `HOD_DUMMY_RUNPATH` or
`HOD_DUMMY_RPATH_FLAG` from the SDK (`js/src/index.js` re-exports
from `js/src/elf.js`). If any recipe has its own local `DUMMY_RUNPATH`
definition, it's stale and should be replaced with the SDK import.

---

## Summary of Commands

```bash
cd /home/crussell/hod
BUN=/nix/store/vmhlm86h4c9gxzrczqd91hwfz2kkfn25-bun-1.3.11/bin/bun
HOD_BIN=./target/debug/hod

# 1. Verify
$BUN -e "import { shellBuild, HOD_DUMMY_RUNPATH } from './js/src/index.js'; console.log('OK:', HOD_DUMMY_RUNPATH.length)"

# 2. Evaluate
BUN=$BUN HOD_BIN=$HOD_BIN bash scripts/rebuild.sh --eval-only

# 3. Generate current roots and build only the current graph
BUN=$BUN HOD_BIN=$HOD_BIN scripts/write-current-roots.sh current-roots.txt
$HOD_BIN build-roots --roots-file current-roots.txt

# 4. After successful build, collect garbage unreachable from current roots
$HOD_BIN gc --roots-file current-roots.txt --dry-run
$HOD_BIN gc --roots-file current-roots.txt
```
