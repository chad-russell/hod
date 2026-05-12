//! Runtime resolution and execution — `hod run` and `hod shell`.
//!
//! Provides the shared logic for resolving a recipe specifier (hex hash or
//! path to a `.ts` file) into a staging path, constructing an environment
//! with the right PATH/LD_LIBRARY_PATH, and exec'ing a command or shell.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::build::{self, BuildOptions};
use crate::hash::{hex_to_hash, hash_to_hex, Hash};
use crate::store::{Store, StoreConfig};

// ---------------------------------------------------------------------------
// Resolution: recipe specifier → recipe hash
// ---------------------------------------------------------------------------

/// A resolved recipe reference, ready for use.
pub struct ResolvedRecipe {
    /// The recipe hash (BLAKE3, 32 bytes).
    pub recipe_hash: Hash,
}

/// Resolve a recipe specifier to a recipe hash.
///
/// A specifier is either:
/// - A 64-character hex BLAKE3 hash (used directly)
/// - A path to a `.ts` file (evaluated via `bun run`, then the last
///   `Imported to store:` line is parsed to find the recipe hash)
///
/// For `.ts` files, this also triggers `build-remaining` for the imported
/// recipes so that the output is ready to use.
pub fn resolve_specifier(
    specifier: &str,
    store_config: &StoreConfig,
) -> Result<ResolvedRecipe, String> {
    // Try as a hex hash first
    if specifier.len() == 64 && specifier.chars().all(|c| c.is_ascii_hexdigit()) {
        let hash = hex_to_hash(specifier).ok_or_else(|| {
            format!("invalid hash: '{specifier}' (expected 64 hex characters)")
        })?;
        return Ok(ResolvedRecipe { recipe_hash: hash });
    }

    // Try as a file path
    let path = Path::new(specifier);
    if path.exists() {
        return resolve_file(path, store_config);
    }

    Err(format!(
        "not a valid hash or file path: '{specifier}'\n\
         hint: provide a 64-char hex recipe hash or a path to a .ts recipe file"
    ))
}

/// Resolve a `.ts` file by evaluating it with `bun run` and capturing the
/// last imported recipe hash.
fn resolve_file(
    path: &Path,
    store_config: &StoreConfig,
) -> Result<ResolvedRecipe, String> {
    let file_str = path.to_string_lossy();

    // Run `bun run <file>` and capture stdout+stderr
    let output = std::process::Command::new("bun")
        .arg("run")
        .arg(path)
        .output()
        .map_err(|e| format!("failed to run `bun run {file_str}`: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        return Err(format!(
            "`bun run {file_str}` failed (exit {:?})\n{stdout}{stderr}",
            output.status.code()
        ));
    }

    // Find the last "Imported to store: <hash>" line
    let last_hash = find_last_imported_hash(&stdout, &stderr);

    let hash_hex = match last_hash {
        Some(h) => h,
        None => {
            return Err(format!(
                "`bun run {file_str}` produced no 'Imported to store:' output.\n\
                 Is this a recipe file that calls importToStore()?"
            ));
        }
    };

    let recipe_hash = hex_to_hash(&hash_hex).ok_or_else(|| {
        format!("corrupt hash from bun output: '{hash_hex}'")
    })?;

    // Now build any remaining unbuilt recipes in the store
    let store = Store::open(store_config)
        .map_err(|e| format!("store error: {e}"))?;
    build_remaining_for(&store, &recipe_hash)?;

    Ok(ResolvedRecipe { recipe_hash })
}

/// Find the last `Imported to store: <64-char-hex>` line in the combined output.
fn find_last_imported_hash(stdout: &str, stderr: &str) -> Option<String> {
    let combined = format!("{stdout}{stderr}");
    let mut last: Option<String> = None;
    for line in combined.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("Imported to store: ") {
            let hash = rest.trim();
            if hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()) {
                last = Some(hash.to_string());
            }
        }
    }
    last
}

/// Build the target recipe and any of its unbuilt transitive dependencies.
fn build_remaining_for(store: &Store, recipe_hash: &Hash) -> Result<(), String> {
    // First, try building just this recipe (handles transitive deps internally)
    let recipe_bytes = store.get_recipe(recipe_hash)
        .map_err(|e| format!("recipe {} not in store: {e}", hash_to_hex(recipe_hash)))?;

    let options = BuildOptions {
        force: false,
        force_recursive: false,
        quiet: true,
        keep_failed: false,
    };

    match build::build(store, &recipe_bytes, &options) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("build failed for {}: {e}", hash_to_hex(recipe_hash))),
    }
}

// ---------------------------------------------------------------------------
// Resolution: recipe hash → staging path
// ---------------------------------------------------------------------------

/// Resolve a recipe hash to its staging path, building if necessary.
pub fn resolve_staging_path(
    store: &Store,
    recipe_hash: &Hash,
) -> Result<PathBuf, String> {
    let output_hash = store.get_output(recipe_hash)
        .map_err(|e| format!("store error: {e}"))?
        .ok_or_else(|| format!(
            "recipe {} has not been built yet",
            hash_to_hex(recipe_hash)
        ))?;
    Ok(build::artifact_staging_path(store, &output_hash))
}

// ---------------------------------------------------------------------------
// Environment construction
// ---------------------------------------------------------------------------

/// Build an environment map for the given staging paths.
///
/// Prepends staging `bin/`, `lib/`, `share/man/`, etc. to the relevant
/// environment variables. The existing process environment is preserved
/// as fallback.
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
                staging.join("share/pkgconfig").to_string_lossy().to_string(),
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
    if parts.is_empty() {
        return;
    }
    let existing = env.get(key).cloned().unwrap_or_default();
    let new = if existing.is_empty() {
        parts.join(":")
    } else {
        format!("{}:{}", parts.join(":"), existing)
    };
    env.insert(key.to_string(), new);
}

// ---------------------------------------------------------------------------
// Command resolution (auto-detect binary from staging output)
// ---------------------------------------------------------------------------

/// Resolve the command to run given the staging path and the user-provided args.
///
/// Logic:
/// - If command is empty → auto-detect the main binary in `bin/`, run with no args
/// - If command[0] matches a file in `bin/` → use that binary, rest are args
/// - Otherwise (starts with `-`, or name not in bin/) → auto-detect main binary,
///   pass all args as flags
pub fn resolve_run_command(
    staging_path: &Path,
    command: &[String],
) -> (String, Vec<String>) {
    let bin_dir = staging_path.join("bin");
    let available_binaries = list_binaries(&bin_dir);

    // Check if the first arg explicitly names a binary in bin/
    if !command.is_empty() {
        let first = &command[0];
        if let Some(matched) = available_binaries.iter().find(|p| {
            p.file_name()
                .map(|n| n == first.as_str())
                .unwrap_or(false)
        }) {
            let bin = matched.to_string_lossy().to_string();
            return (bin, command[1..].to_vec());
        }
    }

    // Auto-detect: pick the main binary, pass all command args through
    let main_binary = match pick_main_binary(&available_binaries) {
        Some(bin) => bin,
        None => {
            eprintln!("hod: no binaries found in package output");
            std::process::exit(4);
        }
    };

    (main_binary.to_string_lossy().to_string(), command.to_vec())
}

/// List executable files in a `bin/` directory, sorted by name.
fn list_binaries(bin_dir: &Path) -> Vec<PathBuf> {
    if !bin_dir.is_dir() {
        return Vec::new();
    }
    let mut entries: Vec<PathBuf> = std::fs::read_dir(bin_dir)
        .ok()
        .map(|dir| {
            dir.filter_map(|e| e.ok())
                .filter(|e| {
                    let path = e.path();
                    path.is_file()
                        || (path.is_symlink() && !path.is_dir())
                })
                .map(|e| e.path())
                .collect()
        })
        .unwrap_or_default();
    entries.sort();
    entries
}

/// Pick the "main" binary from a list of available binaries.
///
/// Heuristics:
/// 1. If there's exactly one binary, use it.
/// 2. If there are multiple, prefer the one that doesn't end in `-config`.
/// 3. If still ambiguous, error and ask the user to specify.
fn pick_main_binary(binaries: &[PathBuf]) -> Option<PathBuf> {
    match binaries.len() {
        0 => None,
        1 => Some(binaries[0].clone()),
        _ => {
            // Filter out auxiliary scripts like *-config
            let candidates: Vec<&PathBuf> = binaries
                .iter()
                .filter(|p| {
                    let name = p.file_name().map(|n| n.to_string_lossy().to_string());
                    !name.as_ref().map(|n| n.ends_with("-config")).unwrap_or(false)
                })
                .collect();
            match candidates.len() {
                1 => Some(candidates[0].clone()),
                _ => {
                    eprintln!("hod: multiple binaries in package, please specify which one:");
                    for path in binaries {
                        if let Some(name) = path.file_name() {
                            eprintln!("  {}", name.to_string_lossy());
                        }
                    }
                    std::process::exit(4);
                }
            }
        }
    }
}

/// Execute a command directly with the constructed environment.
///
/// Replaces the current process via `execvp`. Does not return on success.
#[cfg(unix)]
pub fn exec_command(
    env: HashMap<String, String>,
    command: &str,
    args: &[String],
) -> Result<(), String> {
    use std::os::unix::process::CommandExt;

    let mut cmd = std::process::Command::new(command);
    cmd.args(args);
    cmd.env_clear().envs(&env);

    let err = cmd.exec(); // Does not return on success
    Err(format!("failed to exec '{command}': {err}"))
}

/// Execute an interactive shell with the constructed environment.
///
/// Replaces the current process via `execvp`. Does not return on success.
/// Falls back to `/bin/sh` if `$SHELL` is not set.
#[cfg(unix)]
pub fn exec_shell(
    env: HashMap<String, String>,
    command: Option<&str>,
    extra_args: &[String],
) -> Result<(), String> {
    use std::os::unix::process::CommandExt;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());

    if let Some(cmd) = command {
        // One-shot command mode: exec the shell with -c
        let mut exec_args = vec!["-c".to_string(), cmd.to_string()];
        exec_args.extend(extra_args.iter().cloned());

        let mut proc = std::process::Command::new(&shell);
        proc.args(&exec_args);
        proc.env_clear().envs(&env);

        let err = proc.exec();
        Err(format!("failed to exec shell '{shell}': {err}"))
    } else {
        // Interactive mode: exec the shell directly
        let mut proc = std::process::Command::new(&shell);
        proc.env_clear().envs(&env);

        let err = proc.exec();
        Err(format!("failed to exec shell '{shell}': {err}"))
    }
}
