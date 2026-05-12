# Profiles

> When to read this: you are working on `hod profile`, adding packages to a
> profile, or understanding how activated packages appear on PATH.

## What Are Profiles?

A **profile** is a TypeScript module that declares a named list of packages.
Activating a profile builds any unbuilt packages and creates a **symlink farm**
— a lightweight directory of symlinks into the Hod store — plus shell
activation scripts (`env.sh`, `env.fish`).

## Profile Module Shape

A profile is a `.ts` file that exports a `profile` object:

```typescript
// profiles/default.ts
import { jqRecipe } from "../recipes/native/jq/jq.js";
import { pvRecipe } from "../recipes/native/pv/pv.js";
import { treeRecipe } from "../recipes/native/tree/tree.js";

export const profile = {
  name: "default",
  packages: [jqRecipe, pvRecipe, treeRecipe],
};
```

`packages` is a flat array of `BuiltRecipe` objects (the same type returned by
`download()`, `process()`, `shellBuild()`, etc.). Each has a `.hash` field that
is the BLAKE3 recipe hash.

Profiles compose via normal TypeScript imports:

```typescript
// profiles/work.ts
import { profile as baseProfile } from "./default.js";
import { opensshRecipe } from "../recipes/native/openssh/openssh.js";

export const profile = {
  name: "work",
  packages: [...baseProfile.packages, opensshRecipe],
};
```

## CLI

### `hod profile activate <path.ts>`

1. Evaluate the profile module via Bun (imports all recipes into the store).
2. Build any unbuilt packages.
3. Create a symlink farm at `~/.hod/profiles/<name>/`.
4. Print activation instructions.

### `hod profile build <path.ts>`

Same as activate, but stops after building. Does not create the symlink farm.

Both commands accept `--store <path>` and `--quiet` flags.

## Farm Layout

```
~/.hod/profiles/<name>/
  pkgs/<link-name>   →   <store staging path>   (whole-directory symlink)
  runtime/<dep-name> →   <runtime dep staging path>
  env.sh
  env.fish
```

**Why directory-level symlinks, not merged files?**

Hod binaries are store-relocated: the ELF bootstrap uses relative paths from
the binary's own location to find `ld-linux`, and `$ORIGIN` RPATH to find
`libc`, etc. Each package's staging tree preserves these relative paths.
Symlinking the *entire staging directory* means the binary runs from the same
tree the builder produced, so relocation works without modification.

A merged `bin/` approach (individual file symlinks into shared directories)
fights this design — it breaks the relative path invariants and requires
manually re-linking runtime dependency libs.

**Why no `LD_LIBRARY_PATH`?**

The env scripts intentionally do NOT set `LD_LIBRARY_PATH`. Hod binaries
resolve their libraries entirely through store-relative RPATH + the
AT_EXECFN bootstrap — no global env var needed. Setting `LD_LIBRARY_PATH`
would poison system binaries that use `DT_RUNPATH` (resolved *after*
`LD_LIBRARY_PATH`), causing them to load Hod's glibc instead of their own.
The `runtime/` symlinks are kept for inspection/debugging but are not added
to any environment variable.

### `pkgs/` — package outputs

Each package is linked as a single directory symlink. The link name is derived
from the first binary in the package's `bin/` (e.g., `jq`, `pv`, `tree`).

### `runtime/` — runtime dependencies

Runtime deps (declared in recipes via `runtime_deps`) are linked separately
under `runtime/`. This is a deduplicated set: if all packages depend on the
same toolchain, it appears once as `runtime/toolchain`.

### `env.sh` / `env.fish`

The env scripts compose `PATH`, `LD_LIBRARY_PATH`, `MANPATH`, and
`XDG_DATA_DIRS` from the linked package and runtime directories. They also set
`HOD_PROFILE` to the profile name.

```bash
source ~/.hod/profiles/default/env.sh
jq --version
echo $HOD_PROFILE   # "default"
```

## Activation and Re-activation

Activation is idempotent:

- Bun evaluation is idempotent (`importToStore` no-ops for existing recipes).
- Building is idempotent (cached outputs are used).
- The farm is rebuilt from scratch via atomic swap (build into `.tmp`, rename
  into place, delete `.old`).

No diffing, no special cleanup. Just re-run `hod profile activate`.

## Profiles Directory

Default: `~/.hod/profiles/`. Override via `$HOD_PROFILES_DIR`.

This is separate from the store (`~/.local/share/hod/`) to avoid the `hod
reset` footgun (which does `remove_dir_all` on the store). Profile farms are
user-facing runtime state, not store internals.

## What Is Out of Scope

- **Ephemeral dev shells** (`hod shell` with a profile) — deferred.
- **GC integration** — profiles are not registered as GC roots.
- **CLI add/remove commands** — profiles are edited as TypeScript files.
- **Multiple active profiles** — one farm per profile name; user sources
  whichever `env.sh` they want.
- **Automatic `.bashrc` modification** — just print instructions.
