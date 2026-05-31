# System Profiles

System profiles are Hod's OS-level profile primitive. They are parallel to
user profiles, but they are not shell environments.

## User Profiles vs. System Profiles

| Concept | User profile | System profile |
|---------|--------------|----------------|
| CLI | `hod profile ...` | `hod system ...` |
| Default location | `~/.hod/profiles/<name>/` | `~/.local/share/hod/system/` |
| Purpose | Per-user `PATH`, `MANPATH`, `XDG_DATA_DIRS` activation | Generation-numbered system composition |
| Env scripts | `env.sh`, `env.fish` | none |
| Rollback | Replace profile by re-activating | `hod system rollback` |
| GC root | `profile-<name>.txt` | `system-current.txt` |

A system profile answers: "which Hod packages make up the current system
generation?" It does not answer: "what should my interactive shell source?"

## CLI

```bash
hod system build profiles/system-base.ts
hod system activate profiles/system-base.ts
hod system list
hod system rollback
hod system pin profiles/system-base.ts
hod system unpin
```

`build` evaluates the TypeScript profile and builds the packages but does not
create a generation.

`activate` evaluates, builds, materializes a new generation, atomically switches
`current`, and writes the system GC root pin.

`list` prints generations and marks the active one with `*`.

`rollback` switches `current` to the previous numeric generation and rewrites

`pin` and `unpin` manage only `system-current.txt`; they do not change the
active generation.

## Layout

By default system profiles live under `~/.local/share/hod/system`. Override this
with `HOD_SYSTEM_DIR`. In a booted Hod-derived system the intended canonical
path is `/var/hod/system` for runtime-layered profiles or `/usr/hod/system` for
profiles baked into an immutable bootc image.

```text
$HOD_SYSTEM_DIR/
  generations/
    1/
      pkgs/<name>      -> <store staging path>
      runtime/<name>   -> <runtime dep staging path>
      metadata.json
    2/
      pkgs/...
      runtime/...
      metadata.json
  current -> generations/2
```

The `current` symlink is switched atomically by creating a temporary symlink and
renaming it into place.

`metadata.json` records:

```json
{
  "generation": 2,
  "created_at": "2026-05-28T12:34:56Z",
  "profile_name": "system-base",
  "recipe_hashes": ["..."]
}
```

## Profile Shape

System profiles currently reuse the same minimal TypeScript shape as user
profiles:

```ts
import { bashRecipe } from "../recipes/native/bash.js";
import { coreutilsRecipe } from "../recipes/native/coreutils.js";

export const profile = {
  name: "system-base",
  packages: [
    { name: "bash", recipe: bashRecipe },
    { name: "coreutils", recipe: coreutilsRecipe },
  ],
};
```

Future work will add system-specific fields for rendered systemd units and
bootc image integration. The core system-profile generation mechanism is
deliberately smaller: it only needs to build packages, materialize the farm, and
pin the active generation.

## GC Roots

The active system profile is pinned at:

```text
$HOD_ROOTS_DIR/system-current.txt
```

`HOD_ROOTS_DIR` defaults to `~/.hod/roots`. The file contains one recipe hash
per line and is consumed by the existing GC root discovery path.

## Bootc Role

The current service-boundary direction is bootc-based. In that model, a Hod
system profile is the description of the Hod layer that gets added to the bootc
image:

- Baked-image path: copy the Hod store closure and profile generation into
  `/usr/hod/...` during the container build. `bootc upgrade` updates the base OS
  and the baked Hod layer together.
- Runtime-layered path: deploy new generations under `/var/hod/...` for fast
  iteration, then fold the working generation back into the image.

Both paths use the same generation model and the same `current` symlink
semantics.
