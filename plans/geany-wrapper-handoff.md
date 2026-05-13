# Handoff: Geany Wrapper Scripts + Relocatable Binaries

**Date:** 2026-05-13
**Status:** Resolved on current tree; old notes below describe a stale broken build
**Goal:** Make geany (built by Hod) work when invoked directly from its store path, without `hod run`/`hod shell`, on both the build machine and after `copy-closure` transfer.

## Continuation Update (verified)

The checked-out `recipes/native/geany/geany.ts` now builds a **working** Geany.
The earlier segfault was reproduced only with an older output still present in the store.

### Root cause

The old crashing output was not the same as the current recipe/build logic:

- Old broken output: `d6a09660...`
  - still contained `br_locate_prefix` and `/proc/self/maps` in `libgeany.so`
  - wrapper still had the old `staging/staging/...` path bug
  - segfaulted even on `-V`
- Current rebuilt output from recipe hash `a227bd53...`: `cf41c0a3...`
  - contains `/proc/self/exe` in `libgeany.so`
  - does **not** contain `/proc/self/maps` or `br_locate_prefix`
  - `bin/geany -V` works directly from the store path
  - `copy-closure` to a fresh local store works too

### Proof

Built with:

```bash
hod build --hash a227bd53eb681621f7f370662d67b0478203a9bdcb565bc540b89eff0b74fc5c --force
```

Direct execution from the store path succeeds:

```bash
~/.local/share/hod/staging/cf/cf41c0a3.../bin/geany -V
# geany 2.1 ...
```

After copying the closure to `/tmp/hod-geany-copy2`, running under Xvfb showed Geany opening its UI resources from the copied store, not the original one:

```text
/tmp/hod-geany-copy2/staging/cf/cf41c0a3.../share/geany/geany.glade
/tmp/hod-geany-copy2/staging/cf/cf41c0a3.../bin/../../../c8/.../lib/libgtk-3.so.0
```

So the actual blocker is no longer Geany startup itself; the next real-world step is transferring the same closure to the ThinkPad and running it there.

---

## Problem Statement

Geany 2.1 built with Hod crashes when invoked directly from its staging path. The original (unpatched) build works with `hod run`/`hod shell` but fails when run directly because `utils_resource_dir()` uses compile-time constants (`GEANY_DATADIR` = `//share`) instead of runtime path detection.

**Original error:**
```
Cannot create user-interface: Failed to open file '//share/geany/geany.glade': No such file or directory
```

**After patching:** segfault (exit code 139).

---

## Architecture (Two Layers)

### Layer 1: Wrapper Scripts (GENERIC — `src/wrap.rs`)
- Renames ELF binaries in `bin/` to `.<name>-wrapped`
- Creates POSIX shell wrappers that:
  - Discover their store root from `$0` (via `readlink -f`)
  - Build `XDG_DATA_DIRS` from all runtime dep staging paths
  - Build `GSETTINGS_SCHEMA_PATH` for GLib/GTK schema resolution
  - `exec` the wrapped binary
- Integrated into `src/build.rs` as a post-relocation step
- **Status:** Implemented and path-resolving correctly (after fixing a `staging/staging/` double-path bug)

### Layer 2: App-Specific Data Directory Patch (GEANY-SPECIFIC)
- Geany's `utils_resource_dir()` in `src/utils.c` hardcodes `GEANY_DATADIR` on Linux
- Need to make it find data files at the actual staging prefix
- **Status:** Multiple attempts, all result in segfault — THIS IS THE BLOCKER

---

## What We've Tried (Layer 2 — Geany Patching)

### Attempt 1: Binreloc (`br_locate_prefix`)
- Patched `prefix.c` to also search `r--p` segments (where `.rodata` lives)
- Used global sed to replace `GEANY_DATADIR` → `prefix` across ALL blocks in `utils_resource_dir()`
- **Bug:** Global sed also patched the Windows (`#ifdef G_OS_WIN32`) and macOS (`#ifdef MAC_INTEGRATION`) blocks, causing:
  - Duplicate `gchar *prefix` declarations (variable shadowing)
  - Duplicate `g_free(prefix)` calls (double-free → segfault)
- **Result:** Segfault from double-free in the Windows/macOS code paths

### Attempt 2: Line-number sed (binreloc, scoped to Linux block)
- Used `sed -i '2356c\...'` to only patch lines 2356–2361 (the Linux `else` block)
- Fixed the double-free issue from Attempt 1
- **Bug:** The template literal escaping for tabs was wrong — `\\t` in the template produces `\t` literal in the shell, which busybox sed outputs literally instead of as tabs
- Partially fixed by removing `\\t` prefix, but the build still segfaulted
- **Result:** Still segfault — `br_locate_prefix((void *) "")` appears to return a bad pointer or crash internally

### Attempt 3: `/proc/self/exe` via `realpath` (current state of `geany.ts`)
- Abandoned binreloc entirely
- Patch: use `realpath("/proc/self/exe")` + `g_path_get_dirname` × 2 to compute prefix
- Uses `head`/`tail`/heredoc to splice the replacement (avoids sed escaping issues)
- Removed `--enable-binreloc` configure flag
- Removed `prefix.c` patch
- **Result:** Still segfaults!

The strace of the crash:
```
...reads /proc/self/maps (??why??)...
--- SIGSEGV {si_signo=SIGSEGV, si_code=SEGV_MAPERR, si_addr=NULL} ---
```

**Key observation:** The strace shows `/proc/self/maps` being read right before the crash, but we removed `--enable-binreloc`! Either:
1. The configure script enables binreloc by default when it detects prerequisites (it has `GEANY_CHECK_BINRELOC` macro)
2. The `utils.c` code path that reads `/proc/self/maps` is in the fallback `strdup(GEANY_PREFIX)` path — but GEANY_PREFIX is `//` which is valid
3. Something else in geany reads `/proc/self/maps`

---

## Key Files Modified

### New files:
- **`src/wrap.rs`** (220 lines) — Generic wrapper script generator
  - `generate_wrappers(store, output_dir, runtime_dep_outputs)` → finds ELF binaries in `bin/`, renames them, creates shell wrappers
  - Wrapper template: discovers store root from `$0`, builds XDG/GSETTINGS paths from runtime deps, execs wrapped binary
  - Known issue: `$store_root` computation uses `$(cd "$bin_dir/../../.." && pwd)` which resolves to the staging dir, not the hod root — this was intentional since dep paths are `$store_root/<shard>/<hex>/share`

### Modified files:
- **`src/build.rs`** — Added post-relocation wrapper generation step (lines ~341-370)
- **`src/lib.rs`** — Added `pub mod wrap;` and `pub mod closure;`

### Recipe files:
- **`recipes/native/geany/geany.ts`** — Current state has Attempt 3 (`/proc/self/exe` patch). Previous working version (before any wrapper/patch changes) is NOT saved anywhere — would need to be reconstructed from the understanding that:
  - No source patches at all
  - Configure flags included `--enable-binreloc`
  - No binreloc-related patches worked

### Unmodified but relevant:
- **`src/packed.rs`** — Packed executable bootstrap (AT_EXECFN). Binary has no PT_INTERP; bootstrap stub finds `ld-linux` via relative path baked into the ELF. This works correctly even after renaming to `.<name>-wrapped`.
- **`src/relocate.rs`** — RPATH patching for runtime deps (works correctly)

---

## Working Reference: Original (Unpatched) Geany

The original build (no wrapper, no source patch) works:
```
~/.local/share/hod/staging/2d/2d555b.../bin/geany -V
→ geany 2.1 (built on 2026-05-13 with GTK 3.24.49, GLib 2.82.5)
```

But only because on NixOS the compiled-in `//share` resolves via the system, and it gets the glade file error when transferred to the thinkpad (no `//share/geany/` path exists there).

---

## Critical Context for Next Steps

### The segfault is in the PATCHED code, not the wrapper
- The wrapper path resolution is correct (verified via `bash -x`)
- The packed binary bootstrap works fine even after renaming (verified via strace — `ld-linux` is found)
- The crash happens in `libgeany.so` after all dynamic linking succeeds
- The strace shows `/proc/self/maps` being read right before SIGSEGV at NULL address

### What to investigate:
1. **Check if geany still compiles with binreloc even without `--enable-binreloc`** — the configure script has `GEANY_CHECK_BINRELOC` macro that may auto-detect
2. **Revert to the ORIGINAL geany.ts** (no source patches, with `--enable-binreloc`) and see if that builds and runs
3. **Add debug prints** to the patched code to see where exactly it crashes (e.g., `fprintf(stderr, "prefix=%s\\n", prefix);` before using it)
4. **Consider if `g_path_get_dirname(NULL)` crashes** — if `realpath` returns NULL (e.g., `/proc/self/exe` not available), `g_path_get_dirname` might dereference NULL
5. **Consider alternative approach**: patch `GEANY_DATADIR` at the Makefile/configure level to include the full store path instead of runtime detection

### The simplest possible fix:
Instead of patching C source code, pass `--prefix=$HOME/.local/share/hod/staging/XX/HASH/` to configure. But this bakes in an absolute path and only works on one machine.

A better variant: Use `--prefix=/self-reference` and create a symlink from `/self-reference` → actual store path at runtime. Or use `$ORIGIN`-based paths in the CFLAGS.

---

## Reverting

To get back to a working geany build:
1. Remove the source patch from `geany.ts` (the `head`/`tail`/heredoc block)
2. Add back `--enable-binreloc` to configure flags (optional — doesn't help or hurt)
3. Keep `src/wrap.rs` and its integration in `build.rs` — the wrapper layer is correct
4. The wrapper alone won't fix geany's data directory issue, but won't break anything either

To remove wrapper generation entirely:
1. Remove the wrapper generation block from `src/build.rs` (~lines 341-370)
2. Remove `pub mod wrap;` from `src/lib.rs`
3. Delete `src/wrap.rs`
