# hod copy-closure — Feature Design

## Goal

Copy a recipe's runtime closure from one store to another (local → remote,
remote → local, or local → another local directory). This is the Nix
`nix copy --to` equivalent, enabling binary cache-like workflows and
distribution of build artifacts.

## User Stories

1. **"I built this on my server, now run it on my laptop"** — our yad
   scenario. Copy a recipe closure to a remote machine and run it there.

2. **"Set up a binary cache"** — copy closures to a shared filesystem
   that multiple machines mount at the same path.

3. **"Archive this closure"** — produce a self-contained tarball that
   can be stored/uploaded and extracted later.

4. **"What's in my closure?"** — inspect the closure before copying,
   see sizes and the dependency tree.

## Design Principles

- **Store portability**: The staging directories use `$ORIGIN`-relative
  RUNPATHs. As long as the store path is the same on both machines (default:
  `~/.local/share/hod/`), the relocated ELF files work without modification.
- **Incremental transfer**: rsync-based, only transfers missing staging dirs.
- **Metadata is small**: The DB + recipe files are tiny (~25 MB for the
  whole store, much less for a closure). Copying the full DB is fine; the
  rows are content-addressed and idempotent.
- **No server required**: Just SSH + rsync for remote targets, or
  plain file copy for local/same-machine targets.

## CLI Surface

```
hod copy-closure <RECIPE> [--to <DEST>] [--from <SRC>]
                 [--store <PATH>] [--remote-store <PATH>]

Arguments:
  <RECIPE>          Recipe specifier: 64-char hex hash or path to a .ts file

Options:
  --to <DEST>       Copy TO this destination. Formats:
                      user@host           (remote via SSH, default store path)
                      user@host:path      (remote via SSH, custom store path)
                      /absolute/path      (local directory)
                      ./relative/path     (local directory, relative to CWD)
                    Default: stdout archive (tar.zst)
  --from <SRC>      Copy FROM this source. Same format as --to.
                    Default: the local store.
  --store <PATH>    Override the SOURCE store path (default:
                    $HOD_STORE or ~/.local/share/hod).
  --remote-store <PATH>
                    Override the DESTINATION store path on the remote
                    (default: ~/.local/share/hod). Only applies when
                    --to specifies a user@host.
  -n, --dry-run     Show what would be copied without copying
  -l, --list        List all output hashes + sizes in the closure
      --archive     Produce a self-contained tar.zst archive (default when no --to)
  -o, --output <F>  Write archive to this file (for --archive)
  --force           Overwrite existing files on the destination
  -q, --quiet       Suppress progress output
  -h, --help        Print help

Examples:
  # To a remote machine (default store paths on both ends)
  hod copy-closure 76930b... --to user@thinkpad

  # To a remote machine with custom store path
  hod copy-closure 76930b... --to user@thinkpad:/opt/hod-store

  # To a remote machine where the local store is non-standard too
  hod copy-closure 76930b... \
    --store /mnt/cache/hod \
    --remote-store /opt/hod-store \
    --to user@thinkpad

  # From a remote build server to local
  hod copy-closure 76930b... --from builder@server --to ~/imported-store/

  # From a remote with a custom store path
  hod copy-closure 76930b... \
    --from builder@server:/data/hod \
    --to ~/imported-store/

  # Inspect what would be copied
  hod copy-closure 76930b... --list

  # Produce a standalone archive
  hod copy-closure 76930b... --archive -o yad-closure.tar.zst

  # Dry run
  hod copy-closure 76930b... --to user@thinkpad --dry-run
```

## Implementation Plan

### Phase 1: `hod closure` (inspect-only, no transfer)

The simplest useful starting point — just print the closure info:

```bash
hod closure 76930b...
# Prints:
#   Recipe: 76930b...
#   Runtime deps: 38
#   Total staging size: 912 MB
#   yad (340K) → bin/yad
#   gtk3 (18 MB) → lib/libgtk-3.so, lib/libgdk-3.so, …
#   glib (14 MB) → lib/libglib-2.0.so, …
#   …
```

This teaches `hod` to walk the dependency graph through the DB. It doesn't
transfer anything — just queries and displays.

### Phase 2: `hod copy-closure --to <remote>`

Adds:
1. **Closure resolution**: Walk the recipe's `runtime_deps` through the DB to
   collect all recipe hashes → output hashes → staging dir paths.
2. **File listing**: Generate the list of staging directories, `hod.db`, and
   `recipes/` to transfer.
3. **Transfer**: Use ssh + rsync for remote targets, or `cp -r` for local.
   Only transfer directories that don't exist (or have different content) on
   the destination.

Key algorithm:

```rust
fn copy_closure(
    store: &Store,
    recipe_hash: &Hash,
    dest: &Destination,
) -> Result<(), CopyError> {
    // 1. Get the recipe's runtime_deps from the DB
    let runtime_dep_names = get_runtime_deps(store, recipe_hash)?;

    // 2. For each dep, find the output hash
    // (dep_outputs are stored as dependencies in the recipe
    //  with their dep_name → recipe_hash mapping; we need
    //  recipe_hash → output_hash)
    let mut closure_hashes: Vec<Hash> = Vec::new();
    closure_hashes.push(*recipe_hash);

    for dep_name in &runtime_dep_names {
        // Look up dep's recipe hash from the recipe's dependencies
        let dep_recipe_hash = resolve_dep_recipe_hash(store, recipe_hash, dep_name)?;
        closure_hashes.push(dep_recipe_hash);
    }

    // 3. Resolve each recipe hash → output hash
    let output_hashes: Vec<Hash> = closure_hashes.iter()
        .filter_map(|rh| store.get_output(rh).ok().flatten())
        .collect();

    // 4. Build file list from staging dirs + DB + recipes
    let files: Vec<PathBuf> = output_hashes.iter()
        .map(|h| staging_path(h))
        .collect();
    files.push(store_path.join("hod.db"));
    files.push(store_path.join("recipes"));

    // 5. Transfer
    match dest {
        Destination::Ssh { host, store_path } => {
            rsync_via_ssh(&files, host, store_path)?;
        }
        Destination::Local { path } => {
            copy_local(&files, path)?;
        }
    }

    Ok(())
}
```

### Phase 3: `--from` + `--archive`

Adds pulling from a remote source and the archive format. The archive is just
tar.zst like we already tested — extracting it into the store directory
restores the closure.

### Phase 4: Fast path — transfer by output hash, not recipe hash

The current approach resolves recipe → output via the DB. But the DB itself
stores the recipe→output mapping. On the destination, we could:
1. Send just the output hash list first
2. The destination checks which output hashes it already has
3. Only transfer the missing ones

This avoids re-transferring the toolchain (871 MB) when only a small library
changed.

## Where the Code Goes

```
src/
  closure.rs    ← new module: closure resolution, file listing, transfer
  main.rs       ← add `closure` and `copy-closure` CLI commands
```

The `Store` already has `get_recipe`, `get_output`, etc. We need one new
DB query method:

```rust
// store.rs — new method
pub fn get_runtime_deps(&self, recipe_hash: &Hash) -> Result<Vec<String>, StoreError> {
    // Read the recipe, parse it, extract runtime_deps
}
```

Or more efficiently, store `runtime_deps` as a column in the recipes table
during import (they're already in the binary recipe format, just not
denormalized into the DB).

## Open Questions

1. **Concurrent writes?** If two machines build different things and then
   copy closures to each other, the DBs will diverge. The simple answer: the
   last-writer-wins for `hod.db`, and staging dirs are append-only (never
   modified after creation). A future rework could use per-row DB exports.

2. **Store path portability**: The RUNPATHs use `$ORIGIN`-relative paths
   (no absolute store root). This means closures are store-path-independent.
   The `--store` and `--remote-store` flags are just for telling hod where
   the staging directories live at transport time — they don't affect the
   ELF relocation. A closure copied from `/home/alice/hod` to
   `/opt/hod-cache` works identically, as long as the relative staging tree
   structure (`staging/XX/<hash>/`) is preserved.

3. **Toolchain size**: The 871 MB toolchain staging dir is the single largest
   item. A "runtime-only" variant that omits `sysroot/`, `include/`,
   `libexec/gcc/`, and `bin/` (keeping only `lib/` with ld-linux + libc)
   would reduce the closure by ~750 MB. The RUNPATH entries that point into
   the toolchain staging dir only reference `lib/`, so removing the other
   subdirs is safe for runtime. This is a toolchain recipe change, not a
   core change.

4. **DB format**: If the DB schema changes between hod versions, closures
   copied between different versions might break. Version the DB and
   enforce compatibility during import.

5. **Verification**: Should we verify content hashes on the destination
   after transfer? For now, rsync handles integrity during transfer, but
   verification would catch silent corruption over time.

## Implementation Status

**Phase 1: `hod closure`** — ✅ Implemented
- Walks `runtime_deps` transitively through the store DB
- Displays recipe type, dep name, staging size, and key files (bin/*, lib/*.so)
- Handles non-Process recipes (closure is just the root recipe)

**Phase 2: `hod copy-closure --to <dest>`** — ✅ Implemented
- SSH transfer via `rsync -az --files-from` (incremental by default)
- Local transfer via `cp -r --no-dereference` (incremental by default)
- Transfers staging dirs, recipe files, and `hod.db`
- `--dry-run` shows what would be transferred
- `--force` overwrites existing files on destination

**Phase 3: `--archive`** — ✅ Implemented
- Produces tar.zst archive containing the closure
- Default behavior when `--to` is not specified
- `--output` flag controls the archive filename

**Phase 3: `--from <src>`** — ⏳ Not yet implemented
- CLI flag is present but prints a helpful error message
- Planned: pull closures from remote stores via rsync

**Phase 4: Fast path** — Not yet implemented

## What was added

```
src/
  closure.rs    ← new module: closure resolution, file listing, display, transfer, archive
  lib.rs        ← added `pub mod closure`
  main.rs       ← added `closure` and `copy-closure` CLI subcommands
```

### Store Path Resolution

Both `--store` and `--remote-store` (for SSH destinations) default to the
standard hod store location (`$HOD_STORE` or `~/.local/share/hod`). The
`StoreConfig` struct already handles the local store path. For remote
paths, the SSH transport needs the path to construct `rsync` commands.

Resolution priority:
1. `--store <PATH>` flag (local source)
2. `$HOD_STORE` environment variable
3. `~/.local/share/hod` (default)

Same for remotes via `--remote-store`, or the `:path` suffix on the SSH
destination if provided inline:

```
hod copy-closure 76930b... --to user@host:/opt/hod
//                                    ^^^^^^^^ remote store path

hod copy-closure 76930b... --to user@host --remote-store /opt/hod
//                                          ^^^^^^^^^^^^^^^^ same thing

hod copy-closure 76930b... --to user@host
// Uses default ~/.local/share/hod on the remote
```

If both the inline `:path` suffix AND `--remote-store` are provided,
`--remote-store` wins (explicit trumps inline).
