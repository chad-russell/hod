# Debugging Builds

This document describes debugging workflows that match the current CLI in this checkout.

> Status note: older versions of this doc described `hod shell` and `hod import-file`. Those commands are not implemented in `src/main.rs` right now. The current debugging tools are `hod build --keep-failed`, `hod inspect`, and `hod export-recipe`.

## Quick Reference

| Goal | Current workflow |
|------|------------------|
| Preserve a failed sandbox | `hod build --hash <hash> --keep-failed` |
| Reduce log noise | `hod build --hash <hash> --quiet` |
| Inspect recipe JSON | `hod inspect <hash>` |
| Export recipe binary for debugging | `hod export-recipe <hash> -o <path>` |
| Import a recipe into the store | `hod import-recipe <recipe.hod>` or `importToStore()` from TS |
| Build from store hash | `hod build --hash <hex>` |
| Build from `.hod` file | `hod build <recipe.hod>` |

## Preserve and Inspect a Failed Build

```bash
hod build --hash <recipe-hash> --keep-failed
```

On failure, Hod prints the preserved sandbox path, typically:

```text
~/.local/share/hod/tmp/sandbox-<first-16-chars-of-recipe-hash>/
```

You can inspect files directly from the host:

```bash
SANDBOX=$(ls -td ~/.local/share/hod/tmp/sandbox-* | head -1)
find "$SANDBOX" -maxdepth 3 -type f | sort | head -100
```

Entering the sandbox with `chroot` is sometimes useful, but it is not identical to the original namespace setup; mounts, environment, UID/GID mapping, and network isolation may differ:

```bash
sudo chroot "$SANDBOX" /bin/sh
```

If you need environment variables, read them from the recipe:

```bash
hod inspect <recipe-hash>
```

## Inspecting Recipes

### `hod inspect <hash>` — the primary inspection tool

Prints a recipe's JSON representation directly from the store. No `.hod` file needed.

```bash
hod inspect 4400c77b29493f69878e9f87661759b181aa699e346c9dea902861badf020d93
```

### `hod export-recipe <hash> -o <path>`

Write the raw `.hod` binary from the store to a file for deep debugging.

```bash
hod export-recipe <hash> -o /tmp/recipe.hod
```

### `hod decode <file.hod>`

Decode a `.hod` file on disk to JSON. Useful with `export-recipe`:

```bash
hod export-recipe <hash> -o /tmp/recipe.hod
hod decode /tmp/recipe.hod
```

### `hod encode <input.json> [--output <output.hod>]`

Encode a JSON recipe to binary. Prints the recipe hash to stdout.

### `hod hash-file <file>`

Compute the BLAKE3 hash of a file's raw bytes.

## Current Sandbox Layout

Dependencies are mounted at canonical store-shaped paths and symlinked into `/store` and `/deps` for convenience:

```text
/
├── <shard>/<output-hash>/  # canonical bind mount (the real mount point)
├── store/<shard>/<output-hash>/  -> ../../<shard>/<output-hash>/
├── deps/<name>/            -> ../<shard>/<output-hash>/
├── out/                    # writable output directory
├── tmp/                    # writable tmpfs when possible
├── homeless-shelter/       # writable HOME
├── dev/                    # host /dev bind mount
└── proc/                   # host /proc bind mount
```

The builder also auto-populates environment variables from dependency outputs:

- `PATH` from dependency `bin/` directories
- `LIBRARY_PATH` from dependency `lib/` directories
- `C_INCLUDE_PATH` from dependency `include/` directories
- `OUT=/out`, `DEPS=/deps`, `TMPDIR=/tmp`, `HOME=/homeless-shelter`

Recipe env vars are set first, then the standard builder vars above are set last (always winning).

## Keeping Iteration Fast

- Edit `.ts` source and re-run `bun run <file>.ts` to re-import to the store.
- Use `hod inspect <hash>` to verify recipe contents.
- Use `--keep-failed` when diagnosing late build failures.
- Use `--force` only when you need to bypass a cached output.
- Do not assume failed sandbox reuse is supported. Current `build_process` removes any existing sandbox for that recipe at build start.

## Future / Desired Workflow

An interactive `hod shell` command would still be valuable for resuming a complex failed build in a live sandbox, but it should be documented here only after it is implemented in the CLI and builder.
