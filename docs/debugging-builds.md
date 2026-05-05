# Debugging Builds

This document describes debugging workflows that match the current CLI in this checkout.

> Status note: older versions of this doc described `hod shell` and `hod import-file`. Those commands are not implemented in `src/main.rs` right now. The current debugging tool is `hod build --keep-failed`; recipe-file helpers are `hod encode`, `hod decode`, `hod hash-file`, and `hod import-recipe`.

## Quick Reference

| Goal | Current workflow |
|------|------------------|
| Preserve a failed sandbox | `hod build <recipe.hod> --keep-failed` |
| Reduce log noise | `hod build <recipe.hod> --quiet` |
| Inspect recipe JSON | `hod decode <recipe.hod>` |
| Recreate a `.hod` from JSON | `hod encode <recipe.json> --output <recipe.hod>` |
| Import an existing `.hod` into the default store | `hod import-recipe <recipe.hod>` |

## Preserve and Inspect a Failed Build

```bash
hod build recipes/native/bash.hod --keep-failed
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

If you need environment variables, read them from the Process recipe JSON:

```bash
hod decode recipes/native/bash.hod > /tmp/bash-recipe.json
```

## Current Sandbox Layout

Process dependencies are mounted in a store-like layout and symlinked into `/deps`:

```text
/
├── deps/<name>        -> ../store/<shard>/<output-hash>
├── store/<shard>/<output-hash>/
├── out/               # writable output directory
├── tmp/               # writable tmpfs when possible
├── homeless-shelter/  # writable HOME
├── dev/               # host /dev bind mount
└── proc/              # host /proc bind mount
```

The builder also auto-populates environment variables from dependency outputs:

- `PATH` from dependency `bin/` directories
- `LIBRARY_PATH` from dependency `lib/` directories
- `C_INCLUDE_PATH` from dependency `include/` directories
- `OUT=/out`, `DEPS=/deps`, `TMPDIR=/tmp`, `HOME=/homeless-shelter`

Recipe env vars override the auto-env values, except the standard builder vars above are set last.

## Working with Recipe Files

### Decode binary `.hod` to JSON

```bash
hod decode recipes/native/bash.hod --output /tmp/bash.json
```

### Encode JSON to binary `.hod`

```bash
hod encode /tmp/bash.json --output /tmp/bash.hod
```

The command prints the BLAKE3 hash of the encoded `.hod` bytes.

### Hash a file's bytes

```bash
hod hash-file ./build-script.sh
```

This computes the content/blob hash of the file bytes, not a recipe hash.

### Import a recipe into the store

```bash
hod import-recipe recipes/native/bash.hod
```

Current limitation: `import-recipe` uses the default store resolution (`$HOD_STORE` or `$XDG_DATA_HOME/hod`) and does not accept `--store`.

## Keeping Iteration Fast

- Prefer editing JSON/TS source and re-running `hod encode` rather than hand-editing binary `.hod` files.
- Use `--keep-failed` when diagnosing late build failures.
- Use `--force` only when you need to bypass a cached output.
- Do not assume failed sandbox reuse is supported. Current `build_process` removes any existing sandbox for that recipe at build start.

## Future / Desired Workflow

An interactive `hod shell` command would still be valuable for resuming a complex failed build in a live sandbox, but it should be documented here only after it is implemented in the CLI and builder.
