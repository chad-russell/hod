# Hod System Profile

**Status:** Implemented
**Owner:** core
**Depends on:** none
**Current authority:** `src/system.rs`, `src/main.rs`, `docs/system-profiles.md`, `tests/system_basic.rs`

## Result

Hod now has a first-pass **system profile** primitive, parallel to user
profiles but intended for OS-level composition instead of per-user shell

Implemented CLI:

```bash
hod system build <profile.ts>
hod system activate <profile.ts>
hod system list
hod system rollback
hod system pin <profile.ts>
hod system unpin
```

Implemented layout:

```text
$HOD_SYSTEM_DIR/
  generations/<gen>/
    pkgs/<name>      -> <store staging path>
    runtime/<name>   -> <runtime dep staging path>
    metadata.json
  current -> generations/<gen>

$HOD_ROOTS_DIR/system-current.txt
```

Default dev path: `~/.local/share/hod/system`.

Intended bootc image paths:

- baked immutable layer: `/usr/hod/system`
- runtime iteration layer: `/var/hod/system`

## What shipped

- `src/system.rs` implements generation directories, metadata,
  generation listing, atomic `current` symlink activation, rollback,
  and GC root pinning.
- `src/main.rs` exposes the `hod system` subcommand.
- `src/profile.rs` now exposes a shared `populate_farm()` helper so
  user profiles and system profiles share package/runtime symlink-farm
  resolution.
- `docs/system-profiles.md` documents the model and bootc role.
- `tests/system_basic.rs` covers build → activate → list → rollback
  plus pin/unpin behavior.

## Scope intentionally kept small

This implementation does **not** render `/etc`, generate systemd units,
or define a full TypeScript `SystemProfile` schema beyond the existing
`{ name, packages }` profile shape. That is deliberate.

The service-boundary architecture pivoted to a bootc base. In that
model, the system-profile primitive still matters, but its first
consumer is a bootc image builder that bakes a Hod store snapshot and
system generation into the image under `/usr/hod/...`. Runtime-layered
profiles under `/var/hod/...` remain useful for fast iteration.

## Validation

```bash
nix develop --accept-flake-config --command cargo test --test system_basic -- --test-threads=1
nix develop --accept-flake-config --command cargo test system::tests -- --test-threads=1
```

Both pass.

## Follow-ups

- `bootc-image-builder.md` will consume this primitive by copying a
  built generation into a derived bootc image.
- `etc-generation.md` is being rescoped to generate only the Hod-owned
  systemd units/drop-ins needed by the Hod layer, not a whole OS `/etc`.
- A future TS helper can add a typed `SystemProfile` facade once unit
  generation semantics are concrete.
