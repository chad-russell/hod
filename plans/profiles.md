# Plan: TypeScript Profiles

**Status:** Implemented; historical design note
**Date:** 2026-05-11
**Current authority:** `docs/profiles.md`, `src/profile.rs`, `profiles/default.ts`
**Replaces:** `plans/end-user-runtime.md`

## Overview

Profiles are TypeScript modules that declare a named list of packages. The
Hod CLI evaluates them via Bun, builds any unbuilt packages, and produces a
symlink farm + env script for persistent activation (home-manager style).

Ephemeral dev shells (`nix develop` style) are deferred but the profile
module shape is designed to compose naturally via TS imports.

---

## Profile Module Shape

A profile is a `.ts` file that exports a `profile` object:

```typescript
// profiles/default.ts
import { ripgrepRecipe } from "../recipes/native/rust/ripgrep/ripgrep.js";
import { fdRecipe } from "../recipes/native/rust/fd/fd.js";
import { gitRecipe } from "../recipes/native/git/git.js";

export const profile = {
  name: "default",
  packages: [ripgrepRecipe, fdRecipe, gitRecipe],
};
```

**Composability** via normal TS imports:

```typescript
// profiles/work.ts
import { profile as baseProfile } from "./base.js";
import { opensshRecipe } from "../recipes/native/openssh/openssh.js";
import { vimRecipe } from "../recipes/native/vim/vim.js";

export const profile = {
  name: "work",
  packages: [...baseProfile.packages, opensshRecipe, vimRecipe],
};
```

`packages` is a flat array of `BuiltRecipe` objects (same type returned by
`download()`, `process()`, `shellBuild()`, etc.). Each has a `.hash` field
that is the BLAKE3 recipe hash.

---

## CLI

Two commands only:

### `hod profile activate <path.ts>`

1. Evaluate the profile module via Bun, extract the profile name and package hashes.
2. Build any unbuilt packages (transitive deps handled by the builder).
3. Create the symlink farm at `~/.hod/profiles/<name>/`.
4. Write `env.sh` (and `env.fish`) into the farm directory.
5. Print activation instructions.

```
$ hod profile activate ./profiles/default.ts
[hod] profile 'default': 23 packages
[hod] building 3 unbuilt packages...
[hod] symlink farm: ~/.hod/profiles/default/
[hod] activated. Add to your shell config:
    source ~/.hod/profiles/default/env.sh
```

### `hod profile build <path.ts>`

Same as activate, but stops after building. Does not create the symlink farm
or write env.sh. Useful for pre-building a profile's packages without
activating.

---

## Bun Evaluation Protocol

The Rust CLI evaluates a profile by running a small inline Bun script that
imports the profile module and prints structured output. This follows the
same pattern as `resolve_file()` in `src/run.rs`.

**Approach:** Write a temporary `.ts` file that imports the profile module
and prints JSON to stdout:

```typescript
import { profile } from "<profile-path>";
// Each package's .hash is the recipe hash
const hashes = profile.packages.map(p => typeof p === 'object' && 'hash' in p ? p.hash : p);
console.log(JSON.stringify({ name: profile.name, packages: hashes }));
```

The Rust side parses the JSON and proceeds.

**Handling `importToStore()` side effects:** Profile modules import recipe
modules, which call `importToStore()` at evaluation time. This means just
evaluating the profile imports all recipes into the store — same as the
existing `bun run` evaluation pattern.

**Bun binary:** Must be available on PATH or specified via `$BUN` env var,
consistent with the existing `scripts/rebuild.sh` convention.

---

## Symlink Farm

### Location

```
~/.hod/profiles/<name>/bin/     → symlinks to store staging paths
~/.hod/profiles/<name>/lib/
~/.hod/profiles/<name>/share/
~/.hod/profiles/<name>/include/
~/.hod/profiles/<name>/env.sh
~/.hod/profiles/<name>/env.fish
```

`~/.hod/profiles/` is the farm root. Override via `$HOD_PROFILES_DIR` if
needed.

### Construction

For each package in the profile:

1. Look up the recipe hash → output hash via `store.get_output()`.
2. Compute the staging path via `artifact_staging_path()`.
3. Walk the staging output and create absolute symlinks in the farm:
   - `staging/bin/*` → `farm/bin/*`
   - `staging/lib/*` → `farm/lib/*`
   - `staging/share/*` → `farm/share/*`
   - `staging/include/*` → `farm/include/*`
   - etc.

### Collision handling

If two packages provide the same file (e.g., both have `bin/python`), the
first package in the array wins. Print a warning to stderr. The user
controls ordering by editing the profile.

### Atomic swap

Build into a temp directory (`~/.hod/profiles/.<name>.tmp`), then rename
atomically. If a farm already exists, rename the old one to `.<name>.old`
first, then rename the new one into place, then delete the old one.

### Symlinks are absolute

Symlinks point at the store staging paths directly. This is correct because
Hod's store-relative relocation means binaries work from any path — they
don't need to be at a specific location.

---

## env.sh

```bash
# hod profile: <name>
export HOD_PROFILE="<name>"
export PATH="$HOME/.hod/profiles/<name>/bin:$PATH"
export LD_LIBRARY_PATH="$HOME/.hod/profiles/<name>/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export MANPATH="$HOME/.hod/profiles/<name>/share/man${MANPATH:+:$MANPATH}"
export XDG_DATA_DIRS="$HOME/.hod/profiles/<name>/share${XDG_DATA_DIRS:+:$XDG_DATA_DIRS}"
```

Also writes `env.fish` with equivalent fish syntax.

`HOD_PROFILE` is set to the profile name so scripts and future tooling can
detect which profile is active.

---

## Implementation

### New files

```
src/
  profile.rs       — Profile loading, symlink farm, env snippet generation
  main.rs          — add Profile subcommand to clap
```

### Changes to existing files

```
src/main.rs        — add Profile { activate, build } subcommands
src/lib.rs         — add `pub mod profile;`
Cargo.toml         — add `serde_json` (for parsing bun output; may already be present)
```

### `src/profile.rs` responsibilities

| Function | Owns |
|----------|------|
| `evaluate_profile(path, store_config)` | Run bun, parse JSON, return `(name, Vec<Hash>)` |
| `build_profile(store, hashes, quiet)` | Build unbuilt packages |
| `create_farm(store, name, hashes)` | Create symlink farm with atomic swap |
| `write_env_snippets(farm_dir, name)` | Write `env.sh` and `env.fish` |

### `src/main.rs` changes

Add a `Profile` subcommand with two actions:

```rust
/// Manage package profiles.
Profile {
    #[command(subcommand)]
    action: ProfileAction,

    /// Override store location.
    #[arg(long, global = true)]
    store: Option<PathBuf>,

    /// Suppress build output.
    #[arg(long, global = true, short)]
    quiet: bool,
},

#[derive(Subcommand)]
enum ProfileAction {
    /// Activate a profile: build, create symlink farm, write env.sh.
    Activate {
        /// Path to the profile .ts file.
        profile_file: PathBuf,
    },

    /// Build all packages in a profile without activating.
    Build {
        /// Path to the profile .ts file.
        profile_file: PathBuf,
    },
}
```

### Bun evaluation detail

```rust
fn evaluate_profile(
    profile_path: &Path,
    store_config: &StoreConfig,
) -> Result<(String, Vec<Hash>), String> {
    // Write a temporary evaluation script
    let tmp = std::env::temp_dir().join("hod-profile-eval.ts");
    let profile_str = profile_path.to_string_lossy();
    let script = format!(
        r#"
import {{ profile }} from "{profile_str}";
const pkgs = profile.packages.map(p => typeof p === 'object' && 'hash' in p ? p.hash : p);
console.log(JSON.stringify({{ name: profile.name, packages: pkgs }}));
"#,
        profile_str = profile_str,
    );
    std::fs::write(&tmp, &script)
        .map_err(|e| format!("cannot write eval script: {e}"))?;

    // Run bun
    let bun = std::env::var("BUN").unwrap_or_else(|_| "bun".to_string());
    let output = std::process::Command::new(&bun)
        .arg("run")
        .arg(&tmp)
        .output()
        .map_err(|e| format!("failed to run bun: {e}"))?;

    // ... parse JSON from stdout, etc.
}
```

This evaluates the profile module (triggering all `importToStore()` calls),
then prints a single JSON line with the profile name and package hashes.

**Important:** The evaluation script path resolution. The profile path may
be relative. Bun resolves imports relative to the temporary script's
location, not the original profile. We should either:
- Write the temp script in the same directory as the profile (messy), or
- Use an absolute path for the import (preferred — `canonicalize()` the
  profile path first), or
- Pass the profile path as a command-line argument and use
  `process.argv` in the eval script.

The cleanest approach: canonicalize the profile path to absolute, then
import it from the temp script.

---

## Re-activation

Running `hod profile activate` again on the same profile is idempotent:
- Bun evaluation is idempotent (importToStore no-ops for existing recipes).
- Building is idempotent (cached outputs are used).
- The symlink farm is rebuilt from scratch via atomic swap.

No diffing, no special cleanup. Just rebuild.

---

## Out of Scope

- **Ephemeral dev shells** (`hod shell` with a profile) — deferred.
- **GC integration** — profiles are not registered as GC roots. User manages
  the roots file manually.
- **CLI add/remove commands** — profiles are edited as TypeScript files.
- **Multiple active profiles** — one farm per profile name, user sources
  whichever env.sh they want.
- **Automatic `.bashrc` modification** — just print instructions.

---

## Validation

After implementation:

```bash
# Create a test profile
cat > /tmp/test-profile.ts << 'EOF'
import { ripgrepRecipe } from "./recipes/native/rust/ripgrep/ripgrep.js";
import { fdRecipe } from "./recipes/native/rust/fd/fd.js";
import { jqRecipe } from "./recipes/native/jq/jq.js";

export const profile = {
  name: "test",
  packages: [ripgrepRecipe, fdRecipe, jqRecipe],
};
EOF

# Activate
hod profile activate /tmp/test-profile.ts

# Verify
ls ~/.hod/profiles/test/bin/
# Should show: fd  jq  rg

# Source and test
source ~/.hod/profiles/test/env.sh
rg --version
fd --version
jq --version
echo $HOD_PROFILE
# Should print: test

# Re-activate (idempotent)
hod profile activate /tmp/test-profile.ts
# Should succeed, no errors

# Build only
hod profile build /tmp/test-profile.ts
# Should build, no symlink farm created
```

---

## Future Work

- **Ephemeral dev shells**: `hod shell ./profiles/default.ts` reuses the same
  profile module and the same `build_env()` logic from `src/run.rs`. The
  difference is: no symlink farm, just set env vars and exec a shell.
- **GC roots**: activated profiles could be registered as GC roots, either by
  writing a roots file or by recording the profile path in the store.
- **Richer profiles**: the `profile` object could gain optional fields like
  `env`, `shellInit`, `motd`, etc. for dev shell customization.
- **Profile dependencies**: one profile importing another is already possible
  via TS imports. Could be formalized if needed.
