//! Git fetch recipe builder — clone a git repo at a known revision.
//!
//! Analogous to Nix's `builtins.fetchGit`. Shells out to `git` to clone the
//! repository, checks out the specified revision, removes `.git`, verifies
//! the output hash, and stores the result.
//!
//! The output is a directory tree (no `.git` metadata) — the same shape as
//! `fetchTarball` output. It can be used as a source dependency in Process
//! recipes.

use crate::build::{Artifact, BuildError, Result};
use crate::hash::{hash_to_hex, Hash};

/// Build a GitFetch recipe: clone the repo, checkout revision, verify hash.
pub fn build_git_fetch(
    store: &crate::store::Store,
    gf: &crate::recipe::RecipeGitFetch,
) -> Result<Artifact> {
    let tmp_dir = store.tmp_dir();
    std::fs::create_dir_all(&tmp_dir)?;

    let clone_dir = tmp_dir.join(format!("git-fetch-{}", hash_to_hex(&gf.expected_hash)));
    if clone_dir.exists() {
        std::fs::remove_dir_all(&clone_dir)?;
    }

    // Clone the repository
    eprintln!(
        "[hod] git clone {} at {}",
        gf.url, gf.revision
    );

    let clone_output = std::process::Command::new("git")
        .args(["clone", &gf.url, clone_dir.to_str().unwrap_or("")])
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_DISCOVERY_ACROSS_FILESYSTEM", "1")
        .output()
        .map_err(|e| {
            BuildError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("failed to spawn git: {e}. Is git installed?"),
            ))
        })?;

    if !clone_output.status.success() {
        let stderr = String::from_utf8_lossy(&clone_output.stderr);
        return Err(BuildError::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("git clone failed for {}: {}", gf.url, stderr.trim()),
        )));
    }

    // Checkout the specified revision
    let checkout_output = std::process::Command::new("git")
        .args(["checkout", &gf.revision])
        .current_dir(&clone_dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|e| {
            BuildError::Io(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("failed to spawn git checkout: {e}"),
            ))
        })?;

    if !checkout_output.status.success() {
        let stderr = String::from_utf8_lossy(&checkout_output.stderr);
        return Err(BuildError::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!(
                "git checkout {} failed for {}: {}",
                gf.revision, gf.url, stderr.trim()
            ),
        )));
    }

    // Remove .git directory — we only want the working tree
    let git_dir = clone_dir.join(".git");
    if git_dir.exists() {
        std::fs::remove_dir_all(&git_dir)?;
    }

    // Capture the output as an Artifact
    let artifact = crate::build::path_to_artifact(&clone_dir, store)?;

    // Verify hash
    let actual_hash = crate::build::artifact_to_hash(&artifact);
    if actual_hash != gf.expected_hash {
        return Err(BuildError::HashMismatch {
            expected: gf.expected_hash,
            got: actual_hash,
        });
    }

    // Stage the output
    let staging_path = crate::build::artifact_staging_path(store, &actual_hash);
    if !staging_path.exists() {
        if let Some(parent) = staging_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        crate::build::copy_dir_recursive(&clone_dir, &staging_path)?;
    }

    // Clean up
    let _ = std::fs::remove_dir_all(&clone_dir);

    Ok(artifact)
}

/// Clone a git repo at a revision and return the BLAKE3 hash of the working tree.
/// Useful for recipe authors to determine the correct hash for their recipe.
#[allow(dead_code)]
pub fn fetch_git_and_hash(url: &str, revision: &str) -> std::io::Result<Hash> {
    let tmp_dir = std::env::temp_dir().join(format!("hod-git-hash-{}", blake3::hash(revision.as_bytes()).to_hex()));
    if tmp_dir.exists() {
        std::fs::remove_dir_all(&tmp_dir)?;
    }
    std::fs::create_dir_all(&tmp_dir)?;

    // Clone
    let clone_output = std::process::Command::new("git")
        .args(["clone", url, tmp_dir.to_str().unwrap_or("")])
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()?;

    if !clone_output.status.success() {
        let stderr = String::from_utf8_lossy(&clone_output.stderr);
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("git clone failed for {}: {}", url, stderr.trim()),
        ));
    }

    // Checkout
    let checkout_output = std::process::Command::new("git")
        .args(["checkout", revision])
        .current_dir(&tmp_dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()?;

    if !checkout_output.status.success() {
        let stderr = String::from_utf8_lossy(&checkout_output.stderr);
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("git checkout {} failed: {}", revision, stderr.trim()),
        ));
    }

    // Remove .git
    let git_dir = tmp_dir.join(".git");
    if git_dir.exists() {
        std::fs::remove_dir_all(&git_dir)?;
    }

    // We need a store to compute the artifact hash. For the hash-only case,
    // we compute the hash directly from the directory content.
    // Walk the directory and hash all files in sorted order.
    let hash = hash_directory(&tmp_dir)?;

    // Clean up
    let _ = std::fs::remove_dir_all(&tmp_dir);

    Ok(hash)
}

/// Recursively hash a directory tree, returning the BLAKE3 hash of the
/// serialized directory structure (file paths + content hashes).
fn hash_directory(path: &std::path::Path) -> std::io::Result<Hash> {
    let mut hasher = blake3::Hasher::new();

    fn walk(dir: &std::path::Path, hasher: &mut blake3::Hasher) -> std::io::Result<()> {
        let mut entries: Vec<std::fs::DirEntry> = std::fs::read_dir(dir)?
            .filter_map(|e| e.ok())
            .collect();
        entries.sort_by_key(|e| e.file_name());

        for entry in entries {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            hasher.update(name_str.as_bytes());
            hasher.update(b"\0");

            let path = entry.path();
            if path.is_dir() {
                walk(&path, hasher)?;
            } else if path.is_file() {
                let content = std::fs::read(&path)?;
                let content_hash = blake3::hash(&content);
                hasher.update(content_hash.as_bytes());
            }
            // Ignore symlinks and special files
        }
        Ok(())
    }

    walk(path, &mut hasher)?;
    Ok(*hasher.finalize().as_bytes())
}
