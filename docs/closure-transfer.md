# Closure Inspection and Transfer

## Overview

A **closure** is the set of all runtime dependencies needed to execute a recipe's output. For a Process recipe with `runtime_deps`, the closure includes the recipe itself plus every dependency reachable by following `runtime_deps` transitively.

Hod provides two CLI commands for working with closures:

> Recent proof point: this path is now strong enough to build Geany, copy its
> closure to another NixOS/KDE machine, and run it there from the transferred
> store.

- **`hod closure`** — inspect the closure (sizes, files, dependency tree)
- **`hod copy-closure`** — transfer the closure to another store or archive it

## Source Code

```
src/closure.rs    Closure resolution, display, transfer, and archive logic
src/main.rs       CLI subcommands: `closure` and `copy-closure`
```

## `hod closure` — Inspect a Closure

Resolves the runtime closure of a recipe and prints a human-readable summary.

```bash
# By recipe hash
hod closure 76930b...

# By .ts file (evaluates, builds if needed, then inspects)
hod closure ./recipes/native/yad/yad.ts
```

Output looks like:

```
Recipe: 76930b3a...
Runtime deps: 38
Total staging size: 912 MB

  (root) (process, 340 KB) → bin/yad
  gtk3 (process, 18 MB) → lib/libgtk-3.so, lib/libgdk-3.so, + 12 more libs
  glib (process, 14 MB) → lib/libglib-2.0.so, ...
  ...
```

Each entry shows: dependency name, recipe type, staging size, and key files (binaries in `bin/`, shared libraries in `lib/`).

### Resolution algorithm

1. Start with the root recipe hash.
2. Load the recipe from the store and decode it.
3. If it's a Process with `runtime_deps`, look up each runtime dep name in the recipe's `dependencies` to find its recipe hash.
4. Add each runtime dep's recipe hash to the queue.
5. Repeat until no new recipes are discovered (BFS with deduplication).
6. For each recipe in the closure, look up its output hash and staging path.
7. Compute the on-disk size of each staging directory.

Non-Process recipes (File, Directory, etc.) have no `runtime_deps`, so their closure is just the root recipe itself.

## `hod copy-closure` — Transfer a Closure

Copies a recipe's runtime closure from the local store to a destination. The destination can be a remote machine via SSH, a local directory, or a tar.zst archive.

### Examples

```bash
# To a remote machine (default store paths on both ends)
hod copy-closure 76930b... --to user@thinkpad

# To a remote machine with custom remote store path
hod copy-closure 76930b... --to user@thinkpad:/opt/hod-store

# Custom remote store path via flag (overrides inline :path)
hod copy-closure 76930b... --to user@thinkpad --remote-store /opt/hod-store

# To a local directory
hod copy-closure 76930b... --to /mnt/backup/hod

# Produce a tar.zst archive (default when no --to)
hod copy-closure 76930b... --archive -o yad-closure.tar.zst

# Dry run — show what would be transferred
hod copy-closure 76930b... --to user@thinkpad --dry-run

# List closure entries (machine-readable)
hod copy-closure 76930b... --list
```

For profile deployment, use `hod profile copy` instead of manually copying each
package closure:

```bash
hod profile copy profiles/thinkpad.ts --to user@thinkpad
```

The command builds the profile locally, runs `copy-closure` for each package
recipe hash, verifies the expected recipe/staging entries on the destination,
and activates the profile from a hash manifest.

Use `--pin` when the deployed profile should be kept alive by remote GC:

```bash
hod profile copy profiles/thinkpad.ts --to user@thinkpad --pin
```

### What gets transferred

For each entry in the closure:

1. **Staging directory** — the built output at `staging/<shard>/<hash>/`
2. **Recipe file** — the binary recipe at `recipes/<shard>/<hash>`
3. **Database** — `hod.db` (contains recipe→output mappings, dependency edges, build logs)

The database is small and content-addressed; copying the full file is fine for now.

### Destination formats

| Format | Example | Transport |
|--------|---------|-----------|
| `user@host` | `alice@thinkpad` | rsync over SSH |
| `user@host:path` | `alice@thinkpad:/opt/hod` | rsync over SSH |
| `/absolute/path` | `/mnt/cache/hod` | local `cp -r` |
| `./relative/path` | `./backup` | local `cp -r` |

For SSH destinations, `rsync` must be installed on both the local and remote machine. The `--remote-store` flag or inline `:path` suffix tells rsync where to place files on the remote.

### Incremental transfer

By default, `copy-closure` skips staging/ and recipe files that already exist on the destination. This makes repeated transfers efficient — only new or changed outputs are copied. Use `--force` to overwrite existing files.

`hod.db` is treated specially and is always refreshed, even in incremental mode, so the destination's recipe→output mappings stay in sync with the transferred closure. Before copying or archiving it, Hod checkpoints SQLite WAL state into the main database file so the exported `hod.db` is self-consistent on disk.

### Archive format

When no `--to` is specified (or `--archive` is passed), `copy-closure` produces a tar.zst archive containing the closure. The archive can be extracted into a store root to restore the closure:

```bash
hod copy-closure 76930b... -o yad-closure.tar.zst
# Later, on another machine:
mkdir -p ~/.local/share/hod
tar --zstd -xf yad-closure.tar.zst -C ~/.local/share/hod
```

### Machine-readable listing

The `--list` flag prints one line per closure entry:

```
<recipe_hash> <output_hash> <staging_size_bytes> <dep_name>
```

Profile deployment uses this listing as a post-copy verification manifest. For
each copied closure entry, the deploy helper checks that the destination has:

- `recipes/<shard>/<recipe_hash>` as a regular recipe file
- `staging/<shard>/<output_hash>` as a staging directory
- a staging size greater than zero when the source reported a nonzero size

This is intentionally a lightweight sanity check. Full content verification can
be added later, but this catches incomplete transfers, stale metadata, and
missing staging outputs before a remote profile is activated.

Example:
```
76930b3a... a1f2c4e8... 348160 (root)
b2e5d7f1... 9c3a1e7b... 18432000 gtk3
...
```

Lines use `-` for missing values (unbuilt outputs). The summary goes to stderr.

### `hod closure --list`

The `--list` flag prints a machine-readable closure listing (same format as
`hod copy-closure --list`):

```bash
hod closure 76930b... --list
```

This is also used internally by `hod copy-closure --from` to query remote
closures over SSH.

## `hod resolve` — Resolve a Specifier to a Hash

Resolves a recipe specifier (64-char hex hash or `.ts` file path) and prints
the recipe hash to stdout. Does not build the recipe.

```bash
# Echo back a hash
hod resolve 76930b3a...

# Evaluate a .ts file and print the hash
hod resolve ./recipes/native/jq/jq.ts
```

This is useful for:
- Getting the hash of a recipe to use in pull workflows
- Verifying that a local `.ts` file produces the expected hash
- Remote resolution via SSH: `ssh user@host hod resolve ./recipes/native/jq/jq.ts`

## `hod copy-closure --from` — Pull from Remote

Pulls a recipe's runtime closure from a remote store (or another local store)
into the local store.

### Examples

```bash
# Pull from a remote machine (default store paths on both ends)
hod copy-closure 76930b... --from user@thinkpad

# Pull from a remote machine with custom remote store path
hod copy-closure 76930b... --from user@thinkpad:/opt/hod-store

# Custom remote store path via flag (overrides inline :path)
hod copy-closure 76930b... --from user@thinkpad --remote-store /opt/hod-store

# Pull from another local store
hod copy-closure 76930b... --from /mnt/other-machine/hod

# Dry run — show what would be pulled
hod copy-closure 76930b... --from user@thinkpad --dry-run

# Force overwrite of existing local files
hod copy-closure 76930b... --from user@thinkpad --force

# Resolve specifier on the remote when not available locally
hod copy-closure ./recipes/native/jq/jq.ts --from user@thinkpad --remote-resolve
```

### How it works (SSH)

1. Resolve the specifier locally (recipe hashes are deterministic).
   With `--remote-resolve`, falls back to `ssh <host> hod resolve <specifier>`
   if local resolution fails.
2. SSH to the remote and run `hod closure <hash> --list` to get the closure entries.
3. Build an rsync file list from the entries (staging dirs + recipe files).
4. Pull the files via rsync from the remote store to the local store.
5. Pull the remote `hod.db` via scp, read the relevant output mappings and
   dependency edges, and merge them into the local store's database.

### How it works (local)

1. Resolve the specifier locally.
2. Open the source store and resolve the closure.
3. Use the standard local transfer path to copy into the destination store.

### Specifier notes

- Passing a **64-char hex hash** is the most reliable form — the hash is
  deterministic and doesn't require the recipe to be built locally.
- Passing a `.ts` file works but will trigger a local build first. For pull
  workflows where you want to avoid building, prefer the hash form.

## Store path resolution

Both source and destination store paths follow the same resolution priority:

1. `--store <PATH>` flag (local source store)
2. `$HOD_STORE` environment variable
3. `~/.local/share/hod` (default)

For remote destinations, the remote store path defaults to `~/.local/share/hod` and can be overridden by:
1. Inline `:path` suffix on the SSH destination (`user@host:/opt/hod`)
2. `--remote-store <PATH>` flag (takes precedence over inline suffix)

## Implementation status

| Feature | Status |
|---------|--------|
| `hod closure` (inspect) | ✅ Implemented |
| `hod copy-closure --to` (SSH) | ✅ Implemented |
| `hod copy-closure --to` (local) | ✅ Implemented |
| `hod copy-closure --archive` | ✅ Implemented |
| `hod copy-closure --list` | ✅ Implemented |
| `hod copy-closure --dry-run` | ✅ Implemented |
| `hod copy-closure --from` (pull from remote) | ✅ Implemented |
| `hod closure --list` | ✅ Implemented |
| `hod resolve` | ✅ Implemented |
| `--remote-resolve` (remote fallback) | ✅ Implemented |

## Caveats

- **All outputs must be built** before transfer. If any recipe in the closure lacks a cached output, `copy-closure` will error and list the unbuilt recipes.
- **Database is a single file.** Copying `hod.db` is a last-writer-wins operation. Hod always refreshes it during `copy-closure` so the destination metadata matches the transferred closure. For now this is acceptable because the DB is append-mostly (new recipes/outputs) and staging directories are never modified after creation.
- **rsync required for SSH.** The SSH transport shells out to `rsync`. If rsync is not installed, the transfer will fail with a clear error message.
- **Store path portability.** Outputs use `$ORIGIN`-relative RUNPATHs, so the ELF binaries work at any store path as long as the relative staging tree structure (`staging/XX/<hash>/`) is preserved.
- **`--from` builds .ts files locally.** When using `--from` with a `.ts` specifier, the recipe is evaluated and built locally before the pull. Pass a raw hash to avoid this.
