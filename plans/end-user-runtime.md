# Plan: End-User Runtime — `hod shell`, `hod run`, Profiles

**Status:** ready for implementation  
**Goal:** Turn Hod from a build system into something a human can use as their
daily-driver package manager — `brew install` / `pacman -S` with
content-addressed store semantics.

---

## Motivation

Today Hod builds packages but has no runtime story. There is no way to
*use* a built package except by invoking its binary at the full store staging
path:

```bash
~/.local/share/hod/staging/55/5559cfcf9.../bin/rg --version
```

That's a build system, not a package manager. For Hod to replace
brew/AUR/pacman it needs three things:

1. **`hod shell`** — enter an environment where built packages are on PATH
2. **Profiles** — a declared set of packages that form a user's environment
3. **Activation** — symlinks or managed PATH entries so packages are
   transparently available

---

## Design Decisions

### D1: Immediate activation (brew-style)

**Decision: immediate.** `hod profile add` automatically rebuilds the symlink
farm. Rationale: for a general-purpose package manager, `hod profile add foo
&& foo --version` should Just Work. Nix-style explicit activation adds friction
for the common case. The TOML file + symlink farm are updated atomically
(write TOML to temp file, rename; build farm to temp dir, rename) so there is
no partial-state risk.

### D2: Light mode only for v1 (defer mount mode)

**Decision: defer mount mode.** Light mode (env vars only) works for all
current Hod packages — CLI tools built with the AT_EXECFN bootstrap and
store-relative RUNPATH. The bootstrap already resolves `PT_INTERP` without a
fixed store root, so binaries run correctly from any PATH location. Mount mode
is valuable for GUI apps and FHS-dependent packages, but none of those exist
in the pipeline yet. We add `--mount` later when we have packages that need
it.

### D3: TOML for profile storage

**Decision: TOML.** Profiles are a user-facing concept, distinct from the
binary recipe format. TOML is human-readable and hand-editable, which matters
for a file users will interact with directly. The `toml` crate is mature and
well-maintained in the Rust ecosystem. Recipe format stays binary; profiles
stay TOML — no confusion.

---

## Architecture

### New files

```
src/
  main.rs          — add Shell, Run, Profile subcommands to clap
  profile.rs        — NEW: Profile data type, TOML I/O, symlink farm generation
  shell.rs          — NEW: environment construction + exec logic for shell/run
```

No new subdirectory needed — two new modules alongside the existing ones.

### New dependency

```toml
# Cargo.toml
[dependencies]
toml = "0.8"
```

Used only for profile serialization. Everything else uses existing crates.

### Module responsibilities

| Module | Owns |
|--------|------|
| `src/shell.rs` | Resolving recipe hashes → staging paths, building env maps,
                    `execvp` for `hod shell`, `Command` for `hod run` |
| `src/profile.rs` | `Profile` struct, TOML load/save, symlink farm
                    creation/refresh, XDG state dir resolution |
| `src/main.rs` | CLI arg parsing (clap), wiring, error reporting |

---

## Detailed Design

### `hod shell` — environment entry

```
hod shell [OPTIONS] [<pkg-hash>...]
hod shell --profile <name>
```

**Arguments and flags:**

| Arg | Description |
|-----|-------------|
| `<pkg-hash>...` | Recipe hashes (hex, 64 chars) of packages to include. Resolve via store. |
| `--profile <name>` | Load packages from a named profile instead of inline hashes. |
| `--store <path>` | Override store location (same as all commands). |
| `--command <cmd>` / `-c <cmd>` | Run a command in the shell instead of spawning interactive. |
| `--arg <arg>` | Additional argument to pass (repeatable). Only with `--command`. |

When invoked:
1. Resolve hashes: if `--profile`, load profile TOML and collect all package
   hashes. Otherwise use the positional hash arguments.
2. For each recipe hash, look up output hash via `store.get_output()`. Error
   if not built yet.
3. For each output hash, compute `artifact_staging_path(store, &output_hash)`.
4. Scan each staging directory for `bin/`, `lib/`, `include/`, `share/man/`,
   `share/pkgconfig/` subdirectories.
5. Build env map:
   - `PATH` — `<staging>/bin` entries, prepended to existing `$PATH`
   - `LD_LIBRARY_PATH` — `<staging>/lib` entries, prepended
   - `MANPATH` — `<staging>/share/man` entries, prepended
   - `PKG_CONFIG_PATH` — `<staging>/share/pkgconfig` entries, prepended
   - `C_INCLUDE_PATH` — `<staging>/include` entries, prepended
   - `XDG_DATA_DIRS` — `<staging>/share` entries, prepended
6. If `--command`, `exec` the command directly (no shell wrapping).
   Otherwise, spawn `$SHELL` (fall back to `/bin/sh`) with the modified env.

**No mount namespace.** Binaries with AT_EXECFN bootstrap find their
`ld-linux` via store-relative paths. Binaries with `$ORIGIN/../lib` RUNPATH
find their shared libs the same way. The staging paths are absolute paths on
the host, and the ELF patching makes everything work from any absolute path.

**Environment precedence:** Hod prepends its paths. The user's existing
PATH, MANPATH, etc. are preserved as fallbacks. If a user has `/usr/bin/gcc`
and Hod provides `gcc`, the Hod one wins (prepended) but the system one is
still reachable.

**`--command` mode:** Instead of `execvp($SHELL)`, we `execvp(cmd, args)`.
This avoids a shell layer and is how `hod run` is implemented internally.

```bash
# Interactive
hod shell <rg-hash>
$ rg --version  # works
$ exit

# One-shot command
hod shell <rg-hash> -c 'rg --version'

# Multiple packages
hod shell <rg-hash> <fd-hash> -c 'rg pattern && fd some-file'
```

### `hod run` — one-shot execution

```
hod run [OPTIONS] <pkg-hash>... -- <command> [args...]
```

**Arguments and flags:**

| Arg | Description |
|-----|-------------|
| `<pkg-hash>...` | Recipe hashes of packages to include. |
| `--` | Separator: everything after this is the command + args. |
| `--store <path>` | Override store location. |
| `--profile <name>` | Load packages from a named profile. |

This is a thin wrapper around the shell infrastructure:

```rust
// In src/shell.rs
pub fn run_command(store, hashes, command, args, store_path) -> ! {
    let env = build_env(store, &hashes)?;
    // execvp the command with the constructed env
    // error if exec fails (command not found, etc.)
}
```

No shell wrapping — the command is `execvp`'d directly. This means:
- No shell expansion of globs, variables, etc.
- The command must be an executable in one of the packages' `bin/` dirs
  (or already on the system PATH, which is preserved)
- Arguments are passed literally

```bash
hod run <rg-hash> -- rg 'pattern' ./src
```

### `hod profile` — package environment management

A profile is a named collection of package references stored as a TOML file.

**Location:** resolved via XDG:

```rust
fn profiles_dir() -> PathBuf {
    if let Ok(p) = std::env::var("HOD_STATE") {
        return PathBuf::from(p).join("profiles");
    }
    let state_home = std::env::var("XDG_STATE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
            PathBuf::from(home).join(".local/state")
        });
    state_home.join("hod").join("profiles")
}
```

Default: `~/.local/state/hod/profiles/`.

**Symlink farm location:** `~/.hod-profiles/<name>/` (one farm per profile).
Default profile's farm can be at `~/.hod-profile/` for ergonomic convenience.

**TOML format:**
```toml
# ~/.local/state/hod/profiles/default.toml
name = "default"

[packages]
ripgrep = "aacc9a678e4685b0933e6b518431caef4de3e3f73e5e8f884e9047563e704aa6"
fd = "b3f7e2c4..."
git = "9a1d5e8f..."
```

**Rust type:**
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub name: String,
    pub packages: BTreeMap<String, String>,  // name → recipe_hash (hex)
}
```

**CLI subcommands:**

```bash
hod profile add <name> <pkg-name> <recipe-hash>  # add + rebuild farm
hod profile remove <name> <pkg-name>              # remove + rebuild farm
hod profile list                                   # list profile names
hod profile show <name>                            # print TOML to stdout
hod profile build <name>                           # rebuild symlink farm only
hod profile activate <name>                        # build + write env snippet
```

Note: `profile add` takes a human-readable `<pkg-name>` (used as the TOML
key) and a `<recipe-hash>` (the 64-char hex BLAKE3 hash). The name is for the
user's benefit — it's the key in the TOML file. The hash is the real
identifier.

**Symlink farm generation** (`profile build`):

1. Read profile TOML.
2. For each `(name, recipe_hash)` in packages:
   a. Parse recipe_hash as a 32-byte BLAKE3 hash.
   b. Look up `store.get_output(&recipe_hash)` → `output_hash`.
   c. Error if any package is not yet built.
   d. Compute `artifact_staging_path(store, &output_hash)`.
3. Create a fresh farm directory at `~/.hod-profiles/<name>/`.
   - Build into a temp dir `.<name>.tmp` first, then rename (atomic swap).
4. Walk each package's staging output:
   - For each entry in `bin/`: symlink `farm/bin/<entry> → <staging>/bin/<entry>`
   - For each entry in `lib/`: symlink `farm/lib/<entry> → <staging>/lib/<entry>`
   - For each tree in `share/`: symlink `farm/share/<tree> → <staging>/share/<tree>`
   - For each tree in `include/`: symlink `farm/include/<tree> → <staging>/include/<tree>`
   - For `etc/`, `var/`, etc.: same pattern
5. **Collision handling:** If two packages provide the same file in `bin/`,
   the first package in TOML iteration order (BTreeMap → alphabetical by key)
   wins. Print a warning to stderr.
6. Symlinks are **absolute** (pointing at the store staging path). Relative
   symlinks would break if the farm directory moves.

**`profile activate <name>`** does `profile build` + writes an env snippet:

```bash
# ~/.hod-profiles/<name>/env.sh (for bash/zsh)
export PATH="$HOME/.hod-profiles/<name>/bin:$PATH"
export LD_LIBRARY_PATH="$HOME/.hod-profiles/<name>/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export MANPATH="$HOME/.hod-profiles/<name>/share/man${MANPATH:+:$MANPATH}"
export XDG_DATA_DIRS="$HOME/.hod-profiles/<name>/share${XDG_DATA_DIRS:+:$XDG_DATA_DIRS}"
```

Also writes `env.fish` for fish users (same vars, fish syntax).

Prints:\n> Profile 'default' activated. Add to your shell config:
>   echo 'source ~/.hod-profiles/default/env.sh' >> ~/.bashrc

**Atomic farm swap algorithm:**

```rust
fn build_farm(store: &Store, profile: &Profile, farm_root: &Path) -> Result<()> {
    let farm_dir = farm_root.join(&profile.name);
    let tmp_dir = farm_root.join(format(".{}.tmp", profile.name));

    // Clean any stale temp dir
    let _ = std::fs::remove_dir_all(&tmp_dir);

    // Build into temp dir
    for (pkg_name, recipe_hash_hex) in &profile.packets {
        let recipe_hash = hex_to_hash(recipe_hash_hex)?;
        let output_hash = store.get_output(&recipe_hash)?.ok_or(...)?;
        let staging = artifact_staging_path(store, &output_hash);
        merge_into_farm(&tmp_dir, &staging, pkg_name)?;
    }

    // Atomic swap
    if farm_dir.exists() {
        let old = farm_root.join(format(".{}.old", profile.name));
        let _ = std::fs::remove_dir_all(&old);
        std::fs::rename(&farm_dir, &old)?;
    }
    std::fs::rename(&tmp_dir, &farm_dir)?;

    // Clean old (best-effort)
    let old = farm_root.join(format!(".{}.old", profile.name));
    let _ = std::fs::remove_dir_all(&old);

    Ok(())
}
```

---

## Implementation Tasks

### Phase A: `hod shell` / `hod run`

**A.1** Create `src/shell.rs` with env construction logic.

```rust
// src/shell.rs

use std::collections::HashMap;
use std::path::PathBuf;
use crate::store::Store;
use crate::hash::{Hash, hex_to_hash, hash_to_hex};
use crate::build::artifact_staging_path;

/// Resolve a list of recipe hashes to their staging paths.
/// Returns an error if any recipe has not been built.
pub fn resolve_staging_paths(
    store: &Store,
    recipe_hashes: &[Hash],
) -> Result<Vec<PathBuf>, String> {
    let mut paths = Vec::with_capacity(recipe_hashes.len());
    for hash in recipe_hashes {
        let output_hash = store.get_output(hash)
            .map_err(|e| format!("store error: {e}"))?
            .ok_or_else(|| format!(
                "recipe {} has not been built yet",
                hash_to_hex(hash)
            ))?;
        paths.push(artifact_staging_path(store, &output_hash));
    }
    Ok(paths)
}

/// Build an environment map for the given staging paths.
/// Prepends to existing env vars from the process environment.
pub fn build_env(staging_paths: &[PathBuf]) -> HashMap<String, String> {
    let mut env: HashMap<String, String> = std::env::vars().collect();

    let mut path_parts: Vec<String> = Vec::new();
    let mut ld_parts: Vec<String> = Vec::new();
    let mut man_parts: Vec<String> = Vec::new();
    let mut pkgconfig_parts: Vec<String> = Vec::new();
    let mut include_parts: Vec<String> = Vec::new();
    let mut xdg_data_parts: Vec<String> = Vec::new();

    for staging in staging_paths {
        if staging.join("bin").is_dir() {
            path_parts.push(staging.join("bin").to_string_lossy().to_string());
        }
        if staging.join("lib").is_dir() {
            ld_parts.push(staging.join("lib").to_string_lossy().to_string());
        }
        if staging.join("share/man").is_dir() {
            man_parts.push(staging.join("share/man").to_string_lossy().to_string());
        }
        if staging.join("share/pkgconfig").is_dir() {
            pkgconfig_parts.push(
                staging.join("share/pkgconfig").to_string_lossy().to_string()
            );
        }
        if staging.join("include").is_dir() {
            include_parts.push(staging.join("include").to_string_lossy().to_string());
        }
        if staging.join("share").is_dir() {
            xdg_data_parts.push(staging.join("share").to_string_lossy().to_string());
        }
    }

    prepend_env(&mut env, "PATH", &path_parts);
    prepend_env(&mut env, "LD_LIBRARY_PATH", &ld_parts);
    prepend_env(&mut env, "MANPATH", &man_parts);
    prepend_env(&mut env, "PKG_CONFIG_PATH", &pkgconfig_parts);
    prepend_env(&mut env, "C_INCLUDE_PATH", &include_parts);
    prepend_env(&mut env, "XDG_DATA_DIRS", &xdg_data_parts);

    env
}

fn prepend_env(env: &mut HashMap<String, String>, key: &str, parts: &[String]) {
    if parts.is_empty() { return; }
    let existing = env.get(key).cloned().unwrap_or_default();
    let new = if existing.is_empty() {
        parts.join(":")
    } else {
        format!("{}:{}", parts.join(":"), existing)
    };
    env.insert(key.to_string(), new);
}

/// Execute a shell with the constructed environment.
/// Does not return on success (replaces current process via exec).
pub fn exec_shell(
    env: HashMap<String, String>,
    command: Option<&str>,
    args: &[String],
) -> Result<(), String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());

    if let Some(cmd) = command {
        // One-shot command mode: exec the shell with -c
        let mut exec_args = vec!["-c".to_string(), cmd.to_string()];
        exec_args.extend(args.iter().cloned());
        exec_with_env(&shell, &exec_args, env)
    } else {
        // Interactive mode: exec the shell directly
        exec_with_env(&shell, &[], env)
    }
}

/// Execute a command directly (no shell) with the constructed environment.
pub fn exec_command(
    env: HashMap<String, String>,
    command: &str,
    args: &[String],
) -> Result<(), String> {
    exec_with_env(command, args, env)
}

#[cfg(unix)]
fn exec_with_env(
    program: &str,
    args: &[String],
    env: HashMap<String, String>,
) -> Result<(), String> {
    use std::os::unix::process::CommandExt;
    let mut cmd = std::process::Command::new(program);
    cmd.args(args);
    cmd.env_clear().envs(&env);
    let err = cmd.exec();  // Does not return on success
    Err(format!("failed to exec {}: {err}", program))
}
```

Register the module in `src/lib.rs`:
```rust
pub mod shell;
```

**A.2** Add `Shell` and `Run` subcommands to `src/main.rs`.

Add to the clap `Commands` enum:

```rust
/// Enter a shell environment with packages on PATH.
Shell {
    /// Recipe hashes (hex, 64 chars) of packages to include.
    hashes: Vec<String>,

    /// Load packages from a named profile.
    #[arg(long)]
    profile: Option<String>,

    /// Override store location.
    #[arg(long)]
    store: Option<PathBuf>,

    /// Run a command in the shell environment instead of spawning interactive.
    #[arg(short, long)]
    command: Option<String>,

    /// Additional args to pass (with --command).
    #[arg(short, long)]
    arg: Vec<String>,
},

/// Run a command from a package without spawning a shell.
Run {
    /// Recipe hashes (hex, 64 chars) of packages to include.
    hashes: Vec<String>,

    /// Load packages from a named profile.
    #[arg(long)]
    profile: Option<String>,

    /// Override store location.
    #[arg(long)]
    store: Option<PathBuf>,

    /// The command and arguments to run (after --).
    #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
    command: Vec<String>,
},
```

Wire into `main()`:

```rust
Commands::Shell { hashes, profile, store, command, arg } => {
    cmd_shell(hashes, profile, store, command, arg)
}
Commands::Run { hashes, profile, store, command } => {
    cmd_run(hashes, profile, store, command)
}
```

**A.3** Implement `cmd_shell` and `cmd_run`.

```rust
fn cmd_shell(
    hash_strs: Vec<String>,
    profile_name: Option<String>,
    store_path: Option<PathBuf>,
    command: Option<String>,
    args: Vec<String>,
) -> ! {
    let config = StoreConfig { path: store_path };
    let store = match Store::open(&config) {
        Ok(s) => s,
        Err(e) => { eprintln!("hod: store error: {e}"); process::exit(10); }
    };

    let hashes = resolve_hashes(&hash_strs, profile_name.as_deref(), &store);
    let staging_paths = match hod::shell::resolve_staging_paths(&store, &hashes) {
        Ok(p) => p,
        Err(e) => { eprintln!("hod: {e}"); process::exit(4); }
    };

    let env = hod::shell::build_env(&staging_paths);
    match hod::shell::exec_shell(env, command.as_deref(), &args) {
        Ok(()) => process::exit(0),
        Err(e) => { eprintln!("hod: {e}"); process::exit(1); }
    }
}

fn cmd_run(
    hash_strs: Vec<String>,
    profile_name: Option<String>,
    store_path: Option<PathBuf>,
    command: Vec<String>,
) -> ! {
    if command.is_empty() {
        eprintln!("hod: no command specified (use -- <command> [args...])");
        process::exit(3);
    }

    let config = StoreConfig { path: store_path };
    let store = match Store::open(&config) {
        Ok(s) => s,
        Err(e) => { eprintln!("hod: store error: {e}"); process::exit(10); }
    };

    let hashes = resolve_hashes(&hash_strs, profile_name.as_deref(), &store);
    let staging_paths = match hod::shell::resolve_staging_paths(&store, &hashes) {
        Ok(p) => p,
        Err(e) => { eprintln!("hod: {e}"); process::exit(4); }
    };

    let env = hod::shell::build_env(&staging_paths);
    let cmd = &command[0];
    let args: Vec<String> = command[1..].to_vec();
    match hod::shell::exec_command(env, cmd, &args) {
        Ok(()) => process::exit(0),
        Err(e) => { eprintln!("hod: {e}"); process::exit(1); }
    }
}

/// Parse hash strings + optional profile into a list of recipe hashes.
fn resolve_hashes(
    hash_strs: &[String],
    profile_name: Option<&str>,
    store: &Store,
) -> Vec<Hash> {
    let mut hashes = Vec::new();

    // From profile
    if let Some(name) = profile_name {
        let profile = match hod::profile::load_profile(name) {
            Ok(p) => p,
            Err(e) => { eprintln!("hod: {e}"); process::exit(4); }
        };
        for (_name, hash_hex) in &profile.packages {
            match hex_to_hash(hash_hex) {
                Some(h) => hashes.push(h),
                None => {
                    eprintln!("hod: invalid hash in profile: {hash_hex}");
                    process::exit(3);
                }
            }
        }
    }

    // From CLI args
    for s in hash_strs {
        match hex_to_hash(s) {
            Some(h) => hashes.push(h),
            None => {
                eprintln!("hod: invalid hash: '{s}' (expected 64 hex characters)");
                process::exit(3);
            }
        }
    }

    if hashes.is_empty() {
        eprintln!("hod: no packages specified (provide hashes or --profile)");
        process::exit(3);
    }

    hashes
}
```

**Validation:**
```bash
# Build ripgrep
RG_RECIPE=<recipe-hash from bun run recipes/native/ripgrep.ts>
RG_OUTPUT=$(hod build --hash $RG_RECIPE)

# shell - interactive
hod shell $RG_RECIPE
$ rg --version
$ exit

# shell - one-shot
hod shell $RG_RECIPE -c 'rg --version'

# run
hod run $RG_RECIPE -- rg --version

# Multiple packages
FD_RECIPE=<fd-recipe-hash>
hod shell $RG_RECIPE $FD_RECIPE -c 'which rg && which fd'
```

---

### Phase B: Profiles

**B.1** Add `toml = "0.8"` to `Cargo.toml`.

**B.2** Create `src/profile.rs`.

```rust
// src/profile.rs

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use crate::hash::{hex_to_hash, hash_to_hex, Hash};
use crate::store::Store;
use crate::build::artifact_staging_path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub name: String,
    pub packages: BTreeMap<String, String>,  // pkg_name → recipe_hash_hex
}

/// Resolve the profiles directory via XDG.
pub fn profiles_dir() -> PathBuf {
    if let Ok(p) = std::env::var("HOD_STATE") {
        return PathBuf::from(p).join("profiles");
    }
    let state_home = std::env::var("XDG_STATE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME")
                .unwrap_or_else(|_| "/tmp".into());
            PathBuf::from(home).join(".local/state")
        });
    state_home.join("hod").join("profiles")
}

/// Resolve the symlink farm root directory.
pub fn farms_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .unwrap_or_else(|_| "/tmp".into());
    PathBuf::from(home).join(".hod-profiles")
}

/// Load a profile by name.
pub fn load_profile(name: &str) -> Result<Profile, String> {
    let dir = profiles_dir();
    let path = dir.join(format!("{name}.toml"));
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("profile '{name}' not found: {e}"))?;
    toml::from_str(&content)
        .map_err(|e| format!("profile '{name}' is invalid: {e}"))
}

/// Save a profile (atomic: write to temp, rename).
pub fn save_profile(profile: &Profile) -> Result<(), String> {
    let dir = profiles_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("cannot create profiles dir: {e}"))?;

    let path = dir.join(format!("{}.toml", profile.name));
    let tmp_path = dir.join(format!(".{}.tmp", profile.name));

    let content = toml::to_string_pretty(profile)
        .map_err(|e| format!("cannot serialize profile: {e}"))?;

    std::fs::write(&tmp_path, &content)
        .map_err(|e| format!("cannot write profile: {e}"))?;
    std::fs::rename(&tmp_path, &path)
        .map_err(|e| format!("cannot save profile: {e}"))?;

    Ok(())
}

/// List all profile names.
pub fn list_profiles() -> Result<Vec<String>, String> {
    let dir = profiles_dir();
    if !dir.exists() { return Ok(Vec::new()); }
    let mut names = Vec::new();
    for entry in std::fs::read_dir(&dir)
        .map_err(|e| format!("cannot read profiles dir: {e}"))? {
        let entry = entry.map_err(|e| format!("cannot read dir entry: {e}"))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(".toml") {
            names.push(name.trim_end_matches(".toml").to_string());
        }
    }
    names.sort();
    Ok(names)
}

/// Build (or rebuild) the symlink farm for a profile.
pub fn build_farm(store: &Store, profile: &Profile) -> Result<PathBuf, String> {
    let farm_root = farms_dir();
    let farm_dir = farm_root.join(&profile.name);
    let tmp_dir = farm_root.join(format!(".{}.tmp", profile.name));

    // Clean stale temp dir
    let _ = std::fs::remove_dir_all(&tmp_dir);

    // Resolve all packages to staging paths
    let mut pkg_paths: Vec<(String, PathBuf)> = Vec::new();
    for (pkg_name, hash_hex) in &profile.packages {
        let hash = hex_to_hash(hash_hex).ok_or_else(||
            format!("invalid hash in profile for '{pkg_name}': {hash_hex}")
        )?;
        let output_hash = store.get_output(&hash)
            .map_err(|e| format!("store error for '{pkg_name}': {e}"))?
            .ok_or_else(|| format!(
                "package '{pkg_name}' (recipe {}) has not been built",
                hash_hex
            ))?;
        pkg_paths.push((pkg_name.clone(), artifact_staging_path(store, &output_hash)));
    }

    // Build farm into temp dir
    for (pkg_name, staging) in &pkg_paths {
        merge_into_farm(&tmp_dir, staging, pkg_name)?;
    }

    // Atomic swap
    if farm_dir.exists() {
        let old = farm_root.join(format!(".{}.old", profile.name));
        let _ = std::fs::remove_dir_all(&old);
        let _ = std::fs::rename(&farm_dir, &old);
    }
    std::fs::create_dir_all(&farm_root)
        .map_err(|e| format!("cannot create farm root: {e}"))?;
    std::fs::rename(&tmp_dir, &farm_dir)
        .map_err(|e| format!("cannot install farm: {e}"))?;

    // Cleanup old (best-effort)
    let old = farm_root.join(format!(".{}.old", profile.name));
    let _ = std::fs::remove_dir_all(&old);

    Ok(farm_dir)
}

/// Merge a package's staging output into the farm directory.
/// Creates symlinks for bin/, lib/, share/, include/, etc.
/// Warns on collisions (first package wins).
fn merge_into_farm(farm: &Path, staging: &Path, pkg_name: &str) -> Result<(), String> {
    if !staging.exists() {
        return Err(format!("staging path does not exist for '{pkg_name}'"));
    }

    // Subdirs to merge (each becomes a subdir in the farm)
    let subdirs = ["bin", "lib", "include", "share", "etc"];

    for subdir in &subdirs {
        let src = staging.join(subdir);
        if !src.is_dir() { continue; }
        let dst = farm.join(subdir);
        std::fs::create_dir_all(&dst)
            .map_err(|e| format!("cannot create {}: {e}", dst.display()))?;
        merge_tree(&src, &dst, pkg_name)?;
    }

    // Also merge top-level files (e.g., single-file outputs)
    if staging.is_file() {
        // Unlikely but handle: single-file staging output
        let bin_dir = farm.join("bin");
        std::fs::create_dir_all(&bin_dir)
            .map_err(|e| format!("cannot create bin: {e}"))?;
        let link = bin_dir.join(pkg_name);
        if link.exists() {
            eprintln!("[hod] warning: collision in bin/{pkg_name}");
        } else {
            std::os::unix::fs::symlink(staging, &link)
                .map_err(|e| format!("cannot symlink: {e}"))?;
        }
    }

    Ok(())
}

/// Recursively merge a source directory into a destination directory
/// via absolute symlinks.
fn merge_tree(src: &Path, dst: &Path, pkg_name: &str) -> Result<(), String> {
    for entry in std::fs::read_dir(src)
        .map_err(|e| format!("cannot read {}: {e}", src.display()))? {
        let entry = entry.map_err(|e| format!("cannot read dir entry: {e}"))?;
        let name = entry.file_name().to_string_lossy().to_string();
        let src_path = entry.path();
        let dst_path = dst.join(&name);

        if src_path.is_dir() {
            // If dst exists and is a dir, recurse. If it's a symlink to a
            // dir, also recurse (it's a previous package's subdir).
            if !dst_path.exists() {
                std::fs::create_dir(&dst_path)
                    .map_err(|e| format!("cannot create {}: {e}", dst_path.display()))?;
            }
            merge_tree(&src_path, &dst_path, pkg_name)?;
        } else {
            // File or symlink — create a symlink
            if dst_path.exists() {
                eprintln!(
                    "[hod] warning: collision at {} (from {pkg_name}), keeping existing",
                    dst_path.strip_prefix(farms_dir()).unwrap_or(&dst_path).display()
                );
                continue;
            }
            std::os::unix::fs::symlink(&src_path, &dst_path)
                .map_err(|e| format!("cannot symlink {} -> {}: {e}",
                    dst_path.display(), src_path.display()))?;
        }
    }
    Ok(())
}

/// Write shell env snippets for a profile farm.
pub fn write_env_snippets(farm_dir: &Path, profile_name: &str) -> Result<(), String> {
    let farm_str = farm_dir.to_string_lossy();

    // bash/zsh
    let sh_content = formatdoc!(
        "# hod profile: {profile_name}\n\
        export PATH=\"{farm}/bin:$PATH\"\n\
        export LD_LIBRARY_PATH=\"{farm}/lib${{LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}}\"\n\
        export MANPATH=\"{farm}/share/man${{MANPATH:+:$MANPATH}}\"\n\
        export XDG_DATA_DIRS=\"{farm}/share${{XDG_DATA_DIRS:+:$XDG_DATA_DIRS}}\"\n",
        farm = farm_str,
    );
    std::fs::write(farm_dir.join("env.sh"), &sh_content)
        .map_err(|e| format!("cannot write env.sh: {e}"))?;

    // fish
    let fish_content = formatdoc!(
        "# hod profile: {profile_name}\n\
        set -x PATH {farm}/bin $PATH\n\
        set -x LD_LIBRARY_PATH {farm}/lib $LD_LIBRARY_PATH\n\
        set -x MANPATH {farm}/share/man $MANPATH\n\
        set -x XDG_DATA_DIRS {farm}/share $XDG_DATA_DIRS\n",
        farm = farm_str,
    );
    std::fs::write(farm_dir.join("env.fish"), &fish_content)
        .map_err(|e| format!("cannot write env.fish: {e}"))?;

    Ok(())
}
```

Register in `src/lib.rs`:
```rust
pub mod profile;
```

**B.3** Add `Profile` command group to `src/main.rs`.

```rust
/// Manage package profiles.
Profile {
    #[command(subcommand)]
    action: ProfileAction,

    /// Override store location.
    #[arg(long, global = true)]
    store: Option<PathBuf>,
},

#[derive(Subcommand)]
enum ProfileAction {
    /// Add a package to a profile.
    Add {
        /// Profile name.
        name: String,
        /// Package name (human-readable key in the profile).
        pkg_name: String,
        /// Recipe hash (hex, 64 chars).
        recipe_hash: String,
    },
    /// Remove a package from a profile.
    Remove {
        /// Profile name.
        name: String,
        /// Package name to remove.
        pkg_name: String,
    },
    /// List all profiles.
    List,
    /// Show a profile's contents.
    Show {
        /// Profile name.
        name: String,
    },
    /// Build (rebuild) the symlink farm for a profile.
    Build {
        /// Profile name.
        name: String,
    },
    /// Build the symlink farm and write env snippets.
    Activate {
        /// Profile name.
        name: String,
    },
}
```

Wire into `main()`:

```rust
Commands::Profile { action, store } => {
    cmd_profile(action, store)
}
```

```rust
fn cmd_profile(action: ProfileAction, store_path: Option<PathBuf>) -> ! {
    let config = StoreConfig { path: store_path };
    let store = match Store::open(&config) {
        Ok(s) => s,
        Err(e) => { eprintln!("hod: store error: {e}"); process::exit(10); }
    };

    match action {
        ProfileAction::Add { name, pkg_name, recipe_hash } => {
            // Validate the hash
            let hash = match hex_to_hash(&recipe_hash) {
                Some(h) => h,
                None => {
                    eprintln!("hod: invalid hash: '{recipe_hash}'");
                    process::exit(3);
                }
            };
            // Verify the recipe exists and has been built
            match store.get_output(&hash) {
                Ok(Some(_)) => {},
                Ok(None) => {
                    eprintln!("hod: recipe has not been built yet: {recipe_hash}");
                    process::exit(4);
                }
                Err(e) => {
                    eprintln!("hod: store error: {e}");
                    process::exit(10);
                }
            }

            let mut profile = hod::profile::load_profile(&name)
                .unwrap_or_else(|_| hod::profile::Profile {
                    name: name.clone(),
                    packages: BTreeMap::new(),
                });
            profile.packages.insert(pkg_name.clone(), recipe_hash);

            hod::profile::save_profile(&profile)
                .unwrap_or_else(|e| { eprintln!("hod: {e}"); process::exit(10); });

            // Immediate activation: rebuild the farm
            match hod::profile::build_farm(&store, &profile) {
                Ok(farm_dir) => {
                    eprintln!(
                        "[hod] added '{pkg_name}' to profile '{name}' (farm: {})",
                        farm_dir.display(),
                    );
                }
                Err(e) => {
                    eprintln!("hod: farm build failed: {e}");
                    process::exit(10);
                }
            }
            process::exit(0);
        }

        ProfileAction::Remove { name, pkg_name } => {
            let mut profile = match hod::profile::load_profile(&name) {
                Ok(p) => p,
                Err(e) => { eprintln!("hod: {e}"); process::exit(4); }
            };
            if profile.packages.remove(&pkg_name).is_none() {
                eprintln!("hod: package '{pkg_name}' not in profile '{name}'");
                process::exit(4);
            }
            hod::profile::save_profile(&profile)
                .unwrap_or_else(|e| { eprintln!("hod: {e}"); process::exit(10); });

            // Immediate activation: rebuild the farm
            match hod::profile::build_farm(&store, &profile) {
                Ok(farm_dir) => {
                    eprintln!(
                        "[hod] removed '{pkg_name}' from profile '{name}' (farm: {})",
                        farm_dir.display(),
                    );
                }
                Err(e) => {
                    eprintln!("hod: farm build failed: {e}");
                    process::exit(10);
                }
            }
            process::exit(0);
        }

        ProfileAction::List => {
            match hod::profile::list_profiles() {
                Ok(names) => {
                    if names.is_empty() {
                        println!("(no profiles)");
                    } else {
                        for name in &names { println!("{name}"); }
                    }
                }
                Err(e) => { eprintln!("hod: {e}"); process::exit(10); }
            }
            process::exit(0);
        }

        ProfileAction::Show { name } => {
            let profile = match hod::profile::load_profile(&name) {
                Ok(p) => p,
                Err(e) => { eprintln!("hod: {e}"); process::exit(4); }
            };
            let toml_str = toml::to_string_pretty(&profile).unwrap();
            println!("{toml_str}");
            process::exit(0);
        }

        ProfileAction::Build { name } => {
            let profile = match hod::profile::load_profile(&name) {
                Ok(p) => p,
                Err(e) => { eprintln!("hod: {e}"); process::exit(4); }
            };
            match hod::profile::build_farm(&store, &profile) {
                Ok(farm_dir) => {
                    eprintln!("[hod] built farm for '{name}': {}", farm_dir.display());
                }
                Err(e) => {
                    eprintln!("hod: {e}");
                    process::exit(10);
                }
            }
            process::exit(0);
        }

        ProfileAction::Activate { name } => {
            let profile = match hod::profile::load_profile(&name) {
                Ok(p) => p,
                Err(e) => { eprintln!("hod: {e}"); process::exit(4); }
            };
            let farm_dir = match hod::profile::build_farm(&store, &profile) {
                Ok(d) => d,
                Err(e) => { eprintln!("hod: {e}"); process::exit(10); }
            };
            match hod::profile::write_env_snippets(&farm_dir, &name) {
                Ok(()) => {},
                Err(e) => { eprintln!("hod: {e}"); process::exit(10); }
            }
            eprintln!("Profile '{name}' activated.");
            eprintln!("  Add to your shell config:");
            eprintln!("    echo 'source {}/env.sh' >> ~/.bashrc", farm_dir.display());
            process::exit(0);
        }
    }
}
```

**Validation:**
```bash
# Create profile and add packages
RG_RECIPE=$(bun run recipes/native/ripgrep/index.ts 2>/dev/null | tail -1)
hod profile add default ripgrep $RG_RECIPE

# Verify TOML
cat ~/.local/state/hod/profiles/default.toml
# should show: name = "default", [packages] ripgrep = "..."

# Verify symlink farm
ls -la ~/.hod-profiles/default/bin/
~/.hod-profiles/default/bin/rg --version

# Add another package
FD_RECIPE=...
hod profile add default fd $FD_RECIPE
ls ~/.hod-profiles/default/bin/
# should show both rg and fd

# Remove a package
hod profile remove default ripgrep
ls ~/.hod-profiles/default/bin/
# should show only fd

# Activate (writes env.sh)
hod profile activate default
cat ~/.hod-profiles/default/env.sh

# List profiles
hod profile list
# should show: default

# Show profile
hod profile show default
```

---

### Phase C: Polish

**C.1** Add `--profile <name>` to `hod shell` (already designed above — uses
`resolve_hashes` which loads profile packages into the hash list).

**C.2** Add `--profile <name>` to `hod run` (same mechanism).

**C.3** Add `hod profile rename <old> <new>` — renames the TOML file and
moves the farm directory.

**C.4** Add `hod profile delete <name>` — removes the TOML file and deletes
the farm directory. Requires confirmation (or `--force`).

**C.5** Consider `hod profile default <name>` — sets a default profile that
`hod shell` and `hod run` use when no packages or `--profile` are specified.
Stores in `~/.local/state/hod/default-profile` (one line, the profile name).

**C.6** Add `hod list-outputs` — list all built outputs in the store with
their recipe hashes. Useful for finding the hash to pass to `profile add`.

```bash
hod list-outputs
# aacc9a67...  file    built 2026-05-09T12:00:00Z  340ms
# b3f7e2c4...  process built 2026-05-09T11:45:00Z  1.2s
```

**C.7** Future: `hod search <query>` — requires a package index.
Skeleton the CLI subcommand but defer implementation.

---

## Edge Cases and Error Handling

### Package not built
`hod shell` / `hod run` / `profile add` all verify that the recipe has been
built (via `store.get_output()`). If not, print a clear error:
```
hod: recipe aacc9a67... has not been built yet
hint: run 'hod build --hash aacc9a67...' first
```

### Profile not found
```
hod: profile 'work' not found: No such file or directory
hint: create it with: hod profile add work <pkg-name> <hash>
```

### Collision in symlink farm
```
[hod] warning: collision at bin/python (from python3), keeping existing
```
The first package alphabetically wins. The user can rename to control order.

### Empty profile
`hod profile build` on an empty profile creates an empty farm (just the
directory, no bin/ etc.). This is valid — it's a no-op profile.

### Invalid TOML
```
hod: profile 'default' is invalid: expected newline at line 5
```

### Missing store
All commands open the store first and exit with code 10 on failure, same
as `hod build`.

### `$SHELL` not set
Fall back to `/bin/sh`. Print a note to stderr.

---

## Dependency Graph

```
hod shell <hash>
  └── store.get_output(hash) → output_hash
  └── artifact_staging_path(output_hash) → staging dir
  └── build_env([staging dirs]) → env map
  └── execvp($SHELL, env)

hod run <hash> -- <cmd>
  └── same resolution as shell
  └── execvp(<cmd>, env)  (no shell layer)

hod profile add <name> <pkg> <hash>
  └── load or create profile TOML
  └── insert (pkg, hash) into packages map
  └── save profile (atomic rename)
  └── build_farm(store, profile) → symlink farm

hod profile activate <name>
  └── build_farm(store, profile)
  └── write_env_snippets(farm_dir, name)
  └── print activation instructions
```

---

## Future Work (Deferred)

### Mount-mode shell (`--mount`)

Uses Linux user namespaces to create an FHS-like filesystem:
```
/hod/store/<shard>/<hash>/  → bind-mounted store outputs
/lib/ → <glibc-output>/lib/
/usr/ → merged from all packages
/etc/ → skeleton + package configs
```
Needed for GUI apps, Python, Firefox, etc. Requires:
- Rootless user namespace support (works on most Linux distros)
- FHS layout construction logic
- `/etc/resolv.conf` and `/etc/ssl` for network access

### Package index / registry

`hod search` and `hod install ripgrep` (by name) need a registry mapping
package names to recipe hashes. Options:
- A JSON index file published alongside recipes
- A git repo of recipes (like nixpkgs)
- A content-addressed recipe registry in the store itself

Deferred until the manual hash workflow proves too cumbersome.

### Automatic `runtime_deps` inference

When the evaluator exists, it can detect dynamically-linked outputs and
automatically add `runtime_deps` from link-time dependencies. For now,
recipe authors declare `runtime_deps` manually.

### Garbage collection

Profiles pin packages — the GC must not collect packages referenced by
any profile. The `dependencies` table in SQLite already tracks the full
DAG; GC walks the profile → recipe → transitive deps to find live set.

### Rollback

Since profiles are TOML files, a simple rollback is:
```bash
cp ~/.local/state/hod/profiles/default.toml{,.bak}
hod profile remove default some-package
# ... oops ...
cp ~/.local/state/hod/profiles/default.toml.bak ~/.local/state/hod/profiles/default.toml
hod profile build default
```

A proper `hod profile rollback` could automate this by keeping the last
N TOML snapshots in `~/.local/state/hod/profiles/.history/`.

---

## Context Pointers

- `src/main.rs` — existing CLI commands, add new subcommands here
- `src/store.rs` — `get_output()` for recipe hash → output hash lookup
- `src/build.rs` — `artifact_staging_path()` for resolving output filesystem paths
- `src/hash.rs` — `hex_to_hash()`, `hash_to_hex()` for parsing CLI args
- `docs/relocatable-binaries-guide.md` — explains why store-relative binaries
  work from light-mode shells without mount tricks
- `AGENTS.md` — project map, working conventions
- `$XDG_STATE_HOME` / `$XDG_DATA_HOME` — XDG base directory spec for state files
