//! Profile management — evaluate TypeScript profile modules, build packages,
//! create symlink farms, and write activation env scripts.
//!
//! A profile is a `.ts` file exporting `{ name: string, packages: BuiltRecipe[] }`.
//! This module evaluates it via Bun, builds any unbuilt packages, and produces
//! a symlink farm at `~/.hod/profiles/<name>/` with `env.sh` and `env.fish`.
//!
//! ## Farm layout
//!
//! Instead of merging individual files into shared `bin/`, `lib/`, etc.
//! directories (which fights Hod's store-relocation design), each package's
//! entire staging output is linked as a directory symlink under `pkgs/`.
//! The env scripts compose PATH/MANPATH/XDG_DATA_DIRS from those linked
//! directories.
//!
//! This works with store-relocation because binaries are invoked through the
//! symlink chain, the kernel resolves to the store staging path, and the
//! bootstrap + RPATH relative paths resolve correctly from there.
//!
//! Runtime deps (toolchain libc, ld-linux, shared assets) are linked under
//! `runtime/` for inspection and debugging; the profile env scripts do not use
//! them via `LD_LIBRARY_PATH`.

use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::build::{self, BuildOptions};
use crate::hash::{hex_to_hash, hash_to_hex, Hash};
use crate::store::{Store, StoreConfig};

// ---------------------------------------------------------------------------
// Bun evaluation
// ---------------------------------------------------------------------------

/// Parsed output from evaluating a profile module via Bun.
#[derive(Debug, Deserialize)]
struct ProfileOutput {
    name: String,
    packages: Vec<String>,
}

/// Evaluate a profile `.ts` file via Bun and return the profile name and
/// package recipe hashes.
///
/// This writes a temporary evaluation script, runs `bun run` on it, and
/// parses a single JSON line from stdout containing `{ name, packages }`.
///
/// Side effects: evaluating the profile imports all recipe modules, which
/// call `importToStore()` — so all recipes end up in the store.
pub fn evaluate_profile(
    profile_path: &Path,
    _store_config: &StoreConfig,
) -> Result<(String, Vec<Hash>), String> {
    // Canonicalize to absolute path so the Bun import works from any cwd
    let abs_path = profile_path
        .canonicalize()
        .map_err(|e| format!("cannot resolve profile path {}: {e}", profile_path.display()))?;

    let profile_str = abs_path.to_string_lossy();

    // Write a temporary evaluation script
    let tmp = std::env::temp_dir().join("hod-profile-eval.ts");
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
        .map_err(|e| format!("failed to run `{bun} run`: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "`{bun} run` failed (exit {:?})\n{stdout}{stderr}",
            output.status.code()
        ));
    }

    // Parse JSON from stdout — Bun may print other lines (from importToStore etc.)
    // so we look for the JSON line specifically.
    let stdout = String::from_utf8_lossy(&output.stdout);
    let json_line = stdout
        .lines()
        .filter(|l| l.trim_start().starts_with('{'))
        .last()
        .ok_or_else(|| {
            format!(
                "profile evaluation produced no JSON output.\n\
                 stdout: {stdout}"
            )
        })?;

    let profile_out: ProfileOutput =
        serde_json::from_str(json_line.trim()).map_err(|e| {
            format!("failed to parse profile JSON: {e}\nline: {json_line}")
        })?;

    // Parse package hashes
    let mut hashes = Vec::with_capacity(profile_out.packages.len());
    for (i, hex) in profile_out.packages.iter().enumerate() {
        let hash = hex_to_hash(hex).ok_or_else(|| {
            format!(
                "package [{}] has invalid hash '{}' (expected 64 hex chars)",
                i, hex
            )
        })?;
        hashes.push(hash);
    }

    Ok((profile_out.name, hashes))
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/// Build any unbuilt packages in the profile. Returns the number of packages
/// that were actually built (vs already cached).
pub fn build_profile(
    store: &Store,
    hashes: &[Hash],
    quiet: bool,
) -> Result<usize, String> {
    // Determine which packages need building
    let mut unbuilt: Vec<Hash> = Vec::new();
    for hash in hashes {
        match store.get_output(hash) {
            Ok(Some(_)) => {} // already built
            Ok(None) => unbuilt.push(*hash),
            Err(e) => return Err(format!("store error checking output: {e}")),
        }
    }

    if unbuilt.is_empty() {
        return Ok(0);
    }

    eprintln!(
        "[hod] building {} unbuilt package(s)...",
        unbuilt.len()
    );

    let options = BuildOptions {
        force: false,
        force_recursive: false,
        quiet,
        keep_failed: false,
    };

    let mut built = 0;
    for (i, hash) in unbuilt.iter().enumerate() {
        let hex = hash_to_hex(hash);
        eprintln!("[hod] [{}/{}] building {}...", i + 1, unbuilt.len(), hex);

        let recipe_bytes = store.get_recipe(hash).map_err(|e| {
            format!("recipe {} not in store: {e}", hex)
        })?;

        match build::build(store, &recipe_bytes, &options) {
            Ok(output_hash) => {
                eprintln!(
                    "[hod] [{}/{}] built {} → {}",
                    i + 1,
                    unbuilt.len(),
                    hex,
                    hash_to_hex(&output_hash)
                );
                built += 1;
            }
            Err(e) => {
                return Err(format!(
                    "build failed for package {} ({} of {}): {e}",
                    hex,
                    i + 1,
                    unbuilt.len()
                ));
            }
        }
    }

    Ok(built)
}

// ---------------------------------------------------------------------------
// Profiles directory
// ---------------------------------------------------------------------------

/// Resolve the profiles directory.
///
/// Priority: `HOD_PROFILES_DIR` env → `~/.hod/profiles/`
fn profiles_dir() -> PathBuf {
    if let Ok(p) = std::env::var("HOD_PROFILES_DIR") {
        return PathBuf::from(p);
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    PathBuf::from(home).join(".hod/profiles")
}

// ---------------------------------------------------------------------------
// Resolved package info (for env.sh generation)
// ---------------------------------------------------------------------------

/// A resolved package with its staging path and deduced binary name.
struct ResolvedPackage {
    /// Short name for the package directory symlink (derived from the binary name).
    link_name: String,
    /// Absolute path to the staging directory.
    #[allow(dead_code)]
    staging_path: PathBuf,
}

// ---------------------------------------------------------------------------
// Symlink farm
// ---------------------------------------------------------------------------

/// Create a symlink farm for the profile with atomic swap.
///
/// Layout:
///
/// ```text
/// ~/.hod/profiles/<name>/
///   pkgs/<link-name> → <store staging path>
///   runtime/<dep-name> → <runtime dep staging path>
///   env.sh
///   env.fish
/// ```
///
/// Each package's entire staging output is symlinked as a directory. This
/// preserves the store-relative paths that the bootstrap and RPATH rely on.
/// Runtime deps are linked separately under `runtime/` for inspection and for
/// wrapper/runtime logic outside the profile env scripts.
pub fn create_farm(
    store: &Store,
    name: &str,
    hashes: &[Hash],
) -> Result<PathBuf, String> {
    let base = profiles_dir();
    let farm_dir = base.join(name);
    let tmp_dir = base.join(format!(".{name}.tmp"));
    let old_dir = base.join(format!(".{name}.old"));

    // Ensure base directory exists
    std::fs::create_dir_all(&base)
        .map_err(|e| format!("cannot create profiles dir {}: {e}", base.display()))?;

    // Clean up any stale temp/old dirs
    if tmp_dir.exists() {
        std::fs::remove_dir_all(&tmp_dir)
            .map_err(|e| format!("cannot remove stale temp dir: {e}"))?;
    }

    // Create farm subdirectories
    std::fs::create_dir_all(tmp_dir.join("pkgs"))
        .map_err(|e| format!("cannot create pkgs dir: {e}"))?;
    std::fs::create_dir_all(tmp_dir.join("runtime"))
        .map_err(|e| format!("cannot create runtime dir: {e}"))?;

    // Resolve packages: recipe hash → staging path + link name
    let mut packages: Vec<ResolvedPackage> = Vec::new();
    let mut seen_names = std::collections::HashSet::new();

    for hash in hashes {
        let hex = hash_to_hex(hash);

        let output_hash = store.get_output(hash)
            .map_err(|e| format!("store error for package {}: {e}", hex))?
            .ok_or_else(|| format!("package {} has not been built yet", hex))?;

        let staging_path = build::artifact_staging_path(store, &output_hash);
        if !staging_path.exists() {
            return Err(format!(
                "staging path for package {} does not exist: {}",
                hex,
                staging_path.display()
            ));
        }

        // Derive a short link name from the package's binaries
        let link_name = derive_package_name(&staging_path, &hex, &mut seen_names);

        // Create the directory symlink
        let link_path = tmp_dir.join("pkgs").join(&link_name);
        std::os::unix::fs::symlink(&staging_path, &link_path)
            .map_err(|e| format!(
                "cannot symlink {} → {}: {e}",
                link_path.display(), staging_path.display()
            ))?;

        packages.push(ResolvedPackage { link_name, staging_path });
    }

    // Resolve runtime deps (deduplicated)
    let mut runtime_deps: Vec<(String, PathBuf)> = Vec::new();
    let mut seen_runtime: std::collections::HashSet<[u8; 32]> = std::collections::HashSet::new();

    for hash in hashes {
        collect_runtime_deps(store, hash, &mut runtime_deps, &mut seen_runtime)?;
    }

    // Create runtime dep symlinks
    for (dep_name, dep_staging) in &runtime_deps {
        let link_path = tmp_dir.join("runtime").join(dep_name);
        if link_path.exists() || link_path.is_symlink() {
            let _ = std::fs::remove_file(&link_path);
        }
        std::os::unix::fs::symlink(dep_staging, &link_path)
            .map_err(|e| format!(
                "cannot symlink runtime dep {}: {e}", dep_name
            ))?;
    }

    // Write env snippets
    write_env_snippets(&tmp_dir, name, &packages)?;

    // Atomic swap
    if farm_dir.exists() {
        if old_dir.exists() {
            std::fs::remove_dir_all(&old_dir)
                .map_err(|e| format!("cannot remove old dir: {e}"))?;
        }
        std::fs::rename(&farm_dir, &old_dir)
            .map_err(|e| format!("cannot rename existing farm to .old: {e}"))?;
    }

    std::fs::rename(&tmp_dir, &farm_dir)
        .map_err(|e| format!("cannot rename temp farm into place: {e}"))?;

    if old_dir.exists() {
        let _ = std::fs::remove_dir_all(&old_dir);
    }

    Ok(farm_dir)
}

/// Derive a short, human-readable name for a package directory symlink.
///
/// Tries, in order:
/// 1. The name of the first binary in `bin/`
/// 2. Falls back to the first 12 chars of the recipe hash
fn derive_package_name(
    staging_path: &Path,
    hex: &str,
    seen: &mut std::collections::HashSet<String>,
) -> String {
    let bin_dir = staging_path.join("bin");
    let candidate = if bin_dir.is_dir() {
        std::fs::read_dir(&bin_dir)
            .ok()
            .and_then(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.path().is_file() || e.path().is_symlink())
                    .filter(|e| !e.file_name().to_string_lossy().ends_with("-config"))
                    .map(|e| e.file_name().to_string_lossy().to_string())
                    .next()
            })
    } else {
        None
    };

    let base = candidate.unwrap_or_else(|| hex[..12].to_string());

    // Ensure uniqueness
    let mut name = base.clone();
    let mut counter = 2;
    while seen.contains(&name) {
        name = format!("{}-{}", base, counter);
        counter += 1;
    }
    seen.insert(name.clone());
    name
}

/// Collect runtime dependencies for a package by decoding its recipe.
///
/// For Process recipes with `runtime_deps`, resolves each named dep to its
/// staging path. Deduplicates by recipe hash.
fn collect_runtime_deps(
    store: &Store,
    recipe_hash: &Hash,
    runtime_deps: &mut Vec<(String, PathBuf)>,
    seen: &mut std::collections::HashSet<[u8; 32]>,
) -> Result<(), String> {
    let recipe_bytes = store.get_recipe(recipe_hash).map_err(|e| {
        format!("cannot load recipe {}: {e}", hash_to_hex(recipe_hash))
    })?;

    let recipe = crate::recipe::Recipe::decode(&recipe_bytes).map_err(|e| {
        format!("cannot decode recipe {}: {e}", hash_to_hex(recipe_hash))
    })?;

    let process = match recipe {
        crate::recipe::Recipe::Process(p) => p,
        _ => return Ok(()),
    };

    let runtime_dep_names = match &process.runtime_deps {
        Some(names) => names,
        None => return Ok(()),
    };

    let dep_map: std::collections::HashMap<&str, &Hash> = process
        .dependencies
        .iter()
        .map(|d| (d.name.as_str(), &d.recipe_hash))
        .collect();

    for dep_name in runtime_dep_names {
        let dep_recipe_hash = match dep_map.get(dep_name.as_str()) {
            Some(h) => *h,
            None => continue,
        };

        if !seen.insert(*dep_recipe_hash) {
            continue; // already collected
        }

        let dep_output_hash = match store.get_output(&dep_recipe_hash) {
            Ok(Some(h)) => h,
            _ => continue,
        };

        let dep_staging = build::artifact_staging_path(store, &dep_output_hash);
        if dep_staging.exists() {
            runtime_deps.push((dep_name.clone(), dep_staging));
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Environment snippets
// ---------------------------------------------------------------------------

/// Write `env.sh` and `env.fish` into the farm directory.
///
/// Composes PATH, MANPATH, and XDG_DATA_DIRS from the linked package
/// directories.
///
/// NOTE: We intentionally do NOT set `LD_LIBRARY_PATH`. Hod binaries use
/// store-relative RPATH + AT_EXECFN bootstrap to find their libraries, so
/// `LD_LIBRARY_PATH` is unnecessary for them. Setting it would poison system
/// binaries that use `DT_RUNPATH` (resolved *after* `LD_LIBRARY_PATH`),
/// causing them to load Hod's glibc instead of their own. This was the root
/// cause of segfaults when sourcing `env.sh` on NixOS.
fn write_env_snippets(
    farm_dir: &Path,
    name: &str,
    packages: &[ResolvedPackage],
) -> Result<(), String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "$HOME".to_string());
    let farm_path = format!("{home}/.hod/profiles/{name}");

    // Build colon-separated paths for each env var
    let mut path_parts: Vec<String> = Vec::new();
    let mut man_parts: Vec<String> = Vec::new();
    let mut xdg_parts: Vec<String> = Vec::new();

    for pkg in packages {
        let p = format!("{farm_path}/pkgs/{}/bin", pkg.link_name);
        path_parts.push(p);
        let m = format!("{farm_path}/pkgs/{}/share/man", pkg.link_name);
        man_parts.push(m);
        let x = format!("{farm_path}/pkgs/{}/share", pkg.link_name);
        xdg_parts.push(x);
    }

    // env.sh
    let path_val = path_parts.join(":");
    let man_val = man_parts.join(":");
    let xdg_val = xdg_parts.join(":");

    let env_sh = format!(
        r#"# hod profile: {name}
export HOD_PROFILE="{name}"
export PATH="{path_val}:$PATH"
export MANPATH="{man_val}${{MANPATH:+:$MANPATH}}"
export XDG_DATA_DIRS="{xdg_val}${{XDG_DATA_DIRS:+:$XDG_DATA_DIRS}}"
"#,
    );
    std::fs::write(farm_dir.join("env.sh"), &env_sh)
        .map_err(|e| format!("cannot write env.sh: {e}"))?;

    // env.fish
    let fish_path = path_parts.join("\" $PATH \"");
    let fish_man = man_parts.join("\" $MANPATH \"");
    let fish_xdg = xdg_parts.join("\" $XDG_DATA_DIRS \"");

    let env_fish = format!(
        r#"# hod profile: {name}
set -gx HOD_PROFILE "{name}"
set -gx PATH {fish_path} $PATH
set -gx MANPATH {fish_man} $MANPATH
set -gx XDG_DATA_DIRS {fish_xdg} $XDG_DATA_DIRS
"#,
    );
    std::fs::write(farm_dir.join("env.fish"), &env_fish)
        .map_err(|e| format!("cannot write env.fish: {e}"))?;

    Ok(())
}
