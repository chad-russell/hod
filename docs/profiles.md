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
  packages: [
    { name: "jq", recipe: jqRecipe },
    { name: "pv", recipe: pvRecipe },
    { name: "tree", recipe: treeRecipe },
  ],
};
```

`packages` is a flat array. Each entry can be either a `BuiltRecipe` object (the
same type returned by `download()`, `process()`, `shellBuild()`, etc.) or an
object with an explicit profile link name:

```typescript
{ name: "openssh", recipe: opensshRecipe }
```

Explicit names control the directory created under `pkgs/`. Without an explicit
name, Hod falls back to deriving a name from the first binary in the package's
`bin/` directory.

Profiles compose via normal TypeScript imports:

```typescript
// profiles/work.ts
import { profile as baseProfile } from "./default.js";
import { opensshRecipe } from "../recipes/native/openssh/openssh.js";

export const profile = {
  name: "work",
  packages: [...baseProfile.packages, { name: "openssh", recipe: opensshRecipe }],
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

### `hod profile activate-hashes <name> --hashes-file <path>`

Create a profile farm from an explicit list of package recipe hashes. Each line
may be either `<hash>` or `<hash> <name>`. This is mainly for deployment
workflows where a build machine evaluates and copies a profile closure to
another machine, then the destination activates without needing the TypeScript
profile source checkout.

These commands accept `--store <path>` and `--quiet` flags.

### `hod profile copy <path.ts> --to <user@host[:store]> [--name <name>] [--pin]`

Build a profile locally, copy each package closure to a remote machine, verify
the copied recipe/staging entries, upload a temporary hash manifest, and run
`hod profile activate-hashes` on the remote.

```bash
hod profile copy profiles/thinkpad.ts --to crussell@10.10.0.10
```

Pass `--pin` to also write a remote roots file under
`~/.hod/roots/profile-<name>.txt` so future `hod gc` keeps the deployed profile
closure alive:

```bash
hod profile copy profiles/thinkpad.ts --to crussell@10.10.0.10 --pin
```

If the remote `hod` is older and lacks `activate-hashes`, the command uploads
the local `hod` binary as a temporary helper for the activation step.

Verification happens before activation. The helper derives a manifest from
`hod copy-closure --list` for each package and checks, over SSH, that each
expected `recipes/<shard>/<recipe_hash>` file and
`staging/<shard>/<output_hash>` directory exists in the remote store. This keeps
bad or partial transfers from becoming the active profile.

`scripts/hod-deploy-profile` remains as a transitional wrapper for the same
workflow, but new docs and guides should prefer `hod profile copy`.

### Remote builder: `--remote-builder <host>`

Both `hod profile activate` and `hod profile build` accept `--remote-builder`
to delegate building to a remote machine via SSH. This is useful when the
local machine doesn't have the build toolchain or when a faster machine with
a pre-populated store should do the heavy lifting.

**How it works:**

1. The profile `.ts` file is evaluated locally via Bun (recipe hashes are
   deterministic, so this is safe).
2. For each package hash, `ssh <host> hod build --hash <hash>` ensures the
   package is built on the remote. Already-built packages are no-ops.
3. Each package's runtime closure is pulled back to the local store via
   `hod copy-closure <hash> --from <host>`.
4. The symlink farm is created locally as normal.

**Usage:**

```bash
# Build on bees, pull closures, activate locally
hod profile activate profiles/thinkpad.ts --remote-builder bees

# Build only (no activation)
hod profile build profiles/thinkpad.ts --remote-builder bees

# Specify a custom hod command on the remote
hod profile activate profiles/thinkpad.ts --remote-builder bees --remote-hod ~/.cargo/bin/hod
```

**Requirements:**

- The builder host must have `hod` available (in PATH or via `--remote-hod`).
- The builder must have the recipe already imported into its store (e.g. from
  a shared checkout or a previous build). Since recipe hashes are content-
  addressed, the builder's recipes must match the local ones.
- `rsync` must be installed on both machines for closure transfer.

### `hod profile pin <path.ts> [--name <name>]`

Evaluate a profile and write its current package recipe hashes to
`~/.hod/roots/profile-<name>.txt`. This is explicit on purpose: activating a
profile does not automatically make every package a GC root.

```bash
hod profile pin profiles/thinkpad.ts
```

The roots file is a snapshot of the evaluated profile. If the profile changes,
rerun `hod profile pin` to update the roots file.

### `hod profile unpin <name>`

Remove the profile roots file:

```bash
hod profile unpin thinkpad
```

### `hod profile roots`

List `*.txt` roots files under `~/.hod/roots/` and their root counts. Malformed
roots files fail closed instead of being ignored.

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
from the first non-hidden, non-wrapper binary in the package's `bin/` (e.g.,
`jq`, `pv`, `tree`). Multi-binary packages still use a heuristic, so packages
like OpenSSH may get a link name such as `scp` until explicit profile package
names are implemented.

### `runtime/` — runtime dependencies

Runtime deps (declared in recipes via `runtime_deps`) are linked separately
under `runtime/`. This is a deduplicated set: if all packages depend on the
same toolchain, it appears once as `runtime/toolchain`.

### `env.sh` / `env.fish`

The env scripts compose `PATH`, `MANPATH`, and `XDG_DATA_DIRS` from the linked
package directories. They also set `HOD_PROFILE` to the profile name.

They intentionally do **not** set `LD_LIBRARY_PATH`; Hod binaries are expected
to find their own libraries via store-relative RUNPATH + bootstrap logic.

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

## GC Roots

Default roots directory: `~/.hod/roots/`. Override via `$HOD_ROOTS_DIR`.

Any `*.txt` file in this directory is a roots file. Each non-comment line
contains one recipe hash. Comments are allowed with `#`:

```text
# hod roots: profile thinkpad
# one recipe hash per line
943eaf3fa26848b5d3acfc2a85b084a2d4cf5c9fe64621e3ef0d23285f2442f5
```

`hod gc` reads all `~/.hod/roots/*.txt` files by default, unions their recipe
hashes, and preserves the full runtime closure of every root. Additional roots
can be supplied with repeated `--roots-file` flags.

Parsing is fail-closed: an invalid or empty roots file causes GC to stop rather
than collecting data the user expected to keep.

## What Is Out of Scope

- **Ephemeral dev shells** (`hod shell` with a profile) — deferred.
- **CLI add/remove commands** — profiles are edited as TypeScript files.
- **Multiple active profiles** — one farm per profile name; user sources
  whichever `env.sh` they want.
- **Automatic `.bashrc` modification** — just print instructions.
