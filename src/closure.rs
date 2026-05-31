//! Closure resolution and transfer — `hod closure` and `hod copy-closure`.
//!
//! The closure of a recipe is the set of all runtime dependencies needed
//! to execute it. This module walks the `runtime_deps` graph transitively
//! to collect all recipes, outputs, and staging paths needed for inspection
//! or transfer to another store.

use std::collections::{BTreeSet, HashSet, VecDeque};
use std::path::{Path, PathBuf};

use crate::build;
use crate::hash::{hash_shard, hash_to_hex, Hash};
use crate::recipe::Recipe;
use crate::store::{Store, StoreConfig};

// ---------------------------------------------------------------------------
// Closure types
// ---------------------------------------------------------------------------

/// An entry in a resolved closure.
#[derive(Debug, Clone)]
pub struct ClosureEntry {
    /// BLAKE3 hash of the recipe.
    pub recipe_hash: Hash,
    /// BLAKE3 hash of the recipe's built output (None if not built).
    pub output_hash: Option<Hash>,
    /// Path to the staged output directory (None if not built).
    pub staging_path: Option<PathBuf>,
    /// Recipe type name (e.g., "process", "file", "directory").
    pub recipe_type: &'static str,
    /// Dependency name (if this was reached via a named dep in runtime_deps).
    pub dep_name: Option<String>,
    /// Size of the staging directory in bytes (None if not built or not on disk).
    pub staging_size: Option<u64>,
}

/// A resolved closure — the set of recipes needed at runtime.
#[derive(Debug, Clone)]
pub struct Closure {
    pub entries: Vec<ClosureEntry>,
    pub total_staging_size: u64,
}

/// A transfer destination.
#[derive(Debug, Clone)]
pub enum Destination {
    /// Remote host via SSH.
    Ssh {
        /// user@host
        user_host: String,
        /// Store path on the remote machine.
        remote_store: PathBuf,
    },
    /// Local directory path.
    Local { path: PathBuf },
}

// ---------------------------------------------------------------------------
// Closure resolution
// ---------------------------------------------------------------------------

/// Resolve the runtime closure of a recipe.
///
/// Walks `runtime_deps` transitively, collecting all recipes and their
/// output hashes + staging paths. The root recipe is always included.
///
/// For non-Process recipes (which have no `runtime_deps`), the closure
/// contains only the root recipe itself.
pub fn resolve_closure(store: &Store, root_hash: &Hash) -> Result<Closure, String> {
    let mut entries: Vec<ClosureEntry> = Vec::new();
    let mut seen: HashSet<Hash> = HashSet::new();
    let mut queue: VecDeque<(Hash, Option<String>)> = VecDeque::new();

    queue.push_back((*root_hash, None));

    while let Some((recipe_hash, dep_name)) = queue.pop_front() {
        if !seen.insert(recipe_hash) {
            continue;
        }

        let recipe_bytes = store
            .get_recipe(&recipe_hash)
            .map_err(|e| format!("error loading recipe {}: {e}", hash_to_hex(&recipe_hash)))?;
        let recipe = Recipe::decode(&recipe_bytes)
            .map_err(|e| format!("invalid recipe {}: {e}", hash_to_hex(&recipe_hash)))?;

        let recipe_type = format_recipe_type(&recipe);

        let output_hash = store.get_output(&recipe_hash).map_err(|e| {
            format!(
                "error checking output for {}: {e}",
                hash_to_hex(&recipe_hash)
            )
        })?;

        let staging_path = output_hash
            .as_ref()
            .map(|h| build::artifact_staging_path(store, h));

        let staging_size =
            staging_path
                .as_ref()
                .and_then(|p| if p.exists() { dir_size(p).ok() } else { None });

        entries.push(ClosureEntry {
            recipe_hash,
            output_hash,
            staging_path,
            recipe_type,
            dep_name,
            staging_size,
        });

        // If this is a Process with runtime_deps, add them to the queue
        if let Recipe::Process(p) = &recipe {
            if let Some(runtime_dep_names) = &p.runtime_deps {
                for rd_name in runtime_dep_names {
                    if let Some(dep) = p.dependencies.iter().find(|d| d.name == *rd_name) {
                        queue.push_back((dep.recipe_hash, Some(rd_name.clone())));
                    } else {
                        eprintln!(
                            "[hod] warning: runtime_dep '{}' not found in dependencies of {}",
                            rd_name,
                            hash_to_hex(&recipe_hash),
                        );
                    }
                }
            }
        }
    }

    let total_staging_size: u64 = entries.iter().filter_map(|e| e.staging_size).sum();

    Ok(Closure {
        entries,
        total_staging_size,
    })
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/// Print a human-readable summary of the closure (for `hod closure`).
pub fn print_closure(root_hash: &Hash, closure: &Closure) {
    let root_hex = hash_to_hex(root_hash);
    println!("Recipe: {}", &root_hex[..16]);
    println!("Runtime deps: {}", closure.entries.len().saturating_sub(1));
    println!(
        "Total staging size: {}",
        format_size(closure.total_staging_size)
    );
    println!();

    for entry in &closure.entries {
        let name = entry.dep_name.as_deref().unwrap_or("(root)");
        let size = entry
            .staging_size
            .as_ref()
            .map(|s| format_size(*s))
            .unwrap_or_else(|| "not built".to_string());
        let type_tag = entry.recipe_type;

        print!("  {name} ({type_tag}, {size})");

        // Show key files if staging dir exists
        if let Some(ref staging) = entry.staging_path {
            if staging.exists() {
                let key_files = summarize_staging(staging);
                if !key_files.is_empty() {
                    print!(" → {key_files}");
                }
            }
        }

        println!();
    }
}

/// Print the closure as a machine-readable list (for `--list` flag).
///
/// Format: `<recipe_hash> <output_hash> <size> <dep_name>`
pub fn print_closure_list(closure: &Closure) {
    for entry in &closure.entries {
        let name = entry.dep_name.as_deref().unwrap_or("(root)");
        let recipe_hex = hash_to_hex(&entry.recipe_hash);
        let output_hex = entry
            .output_hash
            .map(|h| hash_to_hex(&h))
            .unwrap_or_else(|| "-".to_string());
        let size = entry
            .staging_size
            .map(|s| s.to_string())
            .unwrap_or_else(|| "-".to_string());
        println!("{recipe_hex} {output_hex} {size} {name}");
    }

    eprintln!(
        "\nTotal: {} entries, {} staging size",
        closure.entries.len(),
        format_size(closure.total_staging_size),
    );
}

// ---------------------------------------------------------------------------
// Transfer
// ---------------------------------------------------------------------------

/// Copy the closure to a destination (remote or local).
///
/// Transfers staging directories, recipe files, and the database for all
/// entries in the closure. Uses rsync for SSH destinations and cp for local.
pub fn copy_closure(
    store: &Store,
    closure: &Closure,
    dest: &Destination,
    dry_run: bool,
    force: bool,
    quiet: bool,
) -> Result<(), String> {
    let store_root = store.root().to_path_buf();
    let content_paths = build_content_file_list(store, closure, quiet);
    let metadata_paths = metadata_file_list();
    let mut rel_paths = content_paths.clone();
    rel_paths.extend(metadata_paths.iter().cloned());

    if dry_run {
        eprintln!(
            "[hod] dry run: would transfer {} paths ({}):",
            rel_paths.len(),
            format_size(closure.total_staging_size)
        );
        for p in &rel_paths {
            eprintln!("  {p}");
        }
        return Ok(());
    }

    // `hod.db` is mutable metadata rather than content-addressed store data.
    // Flush the WAL first so the copied file reflects all committed updates.
    store
        .checkpoint_metadata()
        .map_err(|e| format!("failed to checkpoint store metadata: {e}"))?;

    match dest {
        Destination::Ssh {
            user_host,
            remote_store,
        } => transfer_via_rsync(
            &store_root,
            &content_paths,
            &metadata_paths,
            user_host,
            remote_store,
            force,
            quiet,
        )?,
        Destination::Local { path } => transfer_local(&store_root, &rel_paths, path, force, quiet)?,
    }

    Ok(())
}

/// Create a tar.zst archive of the closure.
///
/// The archive contains staging directories, recipe files, and the database
/// for all entries in the closure. Extracting it into a store directory
/// restores the closure.
pub fn archive_closure(
    store: &Store,
    closure: &Closure,
    output_path: &Option<PathBuf>,
    quiet: bool,
) -> Result<(), String> {
    let store_root = store.root().to_path_buf();
    store
        .checkpoint_metadata()
        .map_err(|e| format!("failed to checkpoint store metadata: {e}"))?;
    let mut rel_paths = build_content_file_list(store, closure, quiet);
    rel_paths.extend(metadata_file_list());

    // Write file list to a temp file for tar's --files-from
    let tmp_dir = std::env::temp_dir().join("hod-archive-staging");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| format!("error creating temp dir: {e}"))?;

    let filelist_path = tmp_dir.join("archive-files.txt");
    let filelist_content = rel_paths.join("\n");
    std::fs::write(&filelist_path, &filelist_content)
        .map_err(|e| format!("error writing file list: {e}"))?;

    // Determine output path
    let archive_path = match output_path {
        Some(p) => p.clone(),
        None => {
            let default = std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join("closure.tar.zst");
            if !quiet {
                eprintln!("[hod] writing archive to {}", default.display());
            }
            default
        }
    };

    // Build tar command with zstd compression
    let tar_output = std::process::Command::new("tar")
        .current_dir(&store_root)
        .args(&[
            "--zstd",
            "-cf",
            &archive_path.to_string_lossy(),
            "--files-from",
            &filelist_path.to_string_lossy(),
        ])
        .output()
        .map_err(|e| format!("failed to run tar: {e}"))?;

    if !tar_output.status.success() {
        let stderr = String::from_utf8_lossy(&tar_output.stderr);
        return Err(format!("tar failed: {}", stderr.trim()));
    }

    if !quiet {
        // Get archive size for reporting
        let archive_size = std::fs::metadata(&archive_path)
            .map(|m| m.len())
            .unwrap_or(0);
        eprintln!(
            "[hod] archive written to {} ({})",
            archive_path.display(),
            format_size(archive_size),
        );
    }

    // Clean up temp file
    let _ = std::fs::remove_file(&filelist_path);

    Ok(())
}

/// Build the list of content-addressed relative paths (from store root) to
/// transfer for a closure.
fn build_content_file_list(store: &Store, closure: &Closure, quiet: bool) -> Vec<String> {
    let store_root = store.root();
    let mut rel_paths: BTreeSet<String> = BTreeSet::new();

    // 1. Staging trees for each output. List every directory entry explicitly
    // so incremental transfers repair incomplete outputs and include dotfiles
    // such as generated wrapper payloads (`bin/.foo-wrapped`).
    for entry in &closure.entries {
        if let Some(ref staging) = entry.staging_path {
            if staging.exists() {
                if let Err(e) = collect_relative_paths(store_root, staging, &mut rel_paths) {
                    if !quiet {
                        eprintln!(
                            "[hod] warning: could not enumerate staging dir for {}: {e}",
                            hash_to_hex(&entry.recipe_hash),
                        );
                    }
                }
            } else if !quiet {
                eprintln!(
                    "[hod] warning: staging dir not found for {} (output {})",
                    hash_to_hex(&entry.recipe_hash),
                    entry
                        .output_hash
                        .as_ref()
                        .map(|h| hash_to_hex(h))
                        .unwrap_or_else(|| "N/A".to_string()),
                );
            }
        }
    }

    // 2. Recipe files
    for entry in &closure.entries {
        let hex = hash_to_hex(&entry.recipe_hash);
        let shard = hash_shard(&entry.recipe_hash);
        let recipe_rel = format!("recipes/{shard}/{hex}");
        let recipe_full = store_root.join(&recipe_rel);
        if recipe_full.exists() {
            rel_paths.insert(recipe_rel);
        }
    }

    rel_paths.into_iter().collect()
}

fn collect_relative_paths(
    store_root: &Path,
    path: &Path,
    rel_paths: &mut BTreeSet<String>,
) -> std::io::Result<()> {
    let meta = std::fs::symlink_metadata(path)?;
    if let Ok(rel) = path.strip_prefix(store_root) {
        let rel_str = rel.to_string_lossy().to_string();
        if !rel_str.is_empty() {
            rel_paths.insert(rel_str);
        }
    }

    if meta.is_dir() && !meta.file_type().is_symlink() {
        let mut entries: Vec<_> = std::fs::read_dir(path)?.filter_map(|e| e.ok()).collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            collect_relative_paths(store_root, &entry.path(), rel_paths)?;
        }
    }

    Ok(())
}

/// Mutable store metadata paths that must be refreshed separately from the
/// content-addressed closure payload.
fn metadata_file_list() -> Vec<String> {
    vec!["hod.db".to_string()]
}

// ---------------------------------------------------------------------------
// Destination parsing
// ---------------------------------------------------------------------------

/// Parse a destination string into a `Destination`.
///
/// Formats:
/// - `user@host` → SSH with default remote store path
/// - `user@host:path` → SSH with custom remote store path
/// - `/absolute/path` → local directory
/// - `./relative/path` or `relative/path` → local directory
pub fn parse_destination(
    dest_str: &str,
    remote_store_override: Option<&Path>,
) -> Result<Destination, String> {
    // Check for SSH destination: contains @ but doesn't start with / or .
    if dest_str.contains('@') && !dest_str.starts_with('/') && !dest_str.starts_with('.') {
        if let Some(colon_pos) = dest_str.find(':') {
            let user_host = &dest_str[..colon_pos];
            let path_str = &dest_str[colon_pos + 1..];
            // --remote-store wins over inline path
            let remote_store = remote_store_override
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| PathBuf::from(path_str));
            Ok(Destination::Ssh {
                user_host: user_host.to_string(),
                remote_store,
            })
        } else {
            let remote_store = remote_store_override
                .map(|p| p.to_path_buf())
                .unwrap_or_else(default_remote_store);
            Ok(Destination::Ssh {
                user_host: dest_str.to_string(),
                remote_store,
            })
        }
    } else {
        // Local path
        let path = PathBuf::from(dest_str);
        let resolved = if path.is_absolute() {
            path
        } else {
            std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join(path)
        };
        Ok(Destination::Local { path: resolved })
    }
}

/// Default remote store path (same resolution as local default).
fn default_remote_store() -> PathBuf {
    StoreConfig { path: None }.resolve()
}

// ---------------------------------------------------------------------------
// Transfer implementations
// ---------------------------------------------------------------------------

fn write_rsync_file_list(
    tmp_dir: &Path,
    rel_paths: &[String],
) -> Result<std::path::PathBuf, String> {
    let filelist_path = tmp_dir.join(format!(
        "rsync-files-{}-{}.txt",
        std::process::id(),
        rel_paths.len()
    ));
    let filelist_content = rel_paths.join("\n");
    std::fs::write(&filelist_path, &filelist_content)
        .map_err(|e| format!("error writing file list: {e}"))?;
    Ok(filelist_path)
}

fn run_rsync_transfer(
    store_root: &Path,
    filelist_path: &Path,
    user_host: &str,
    remote_store: &Path,
    ignore_existing: bool,
) -> Result<(), String> {
    let remote_target = format!("{user_host}:{}", remote_store.display());

    let mut rsync_args = vec![
        "-arz".to_string(),
        "--files-from".to_string(),
        filelist_path.to_string_lossy().to_string(),
    ];

    if ignore_existing {
        rsync_args.push("--ignore-existing".to_string());
    }

    rsync_args.push(store_root.to_string_lossy().to_string());
    rsync_args.push(remote_target);

    let output = std::process::Command::new("rsync")
        .args(&rsync_args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("failed to run rsync: {e}.\nIs rsync installed?"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("rsync failed: {}", stderr.trim()));
    }

    Ok(())
}

/// Transfer files via rsync over SSH.
fn transfer_via_rsync(
    store_root: &Path,
    content_paths: &[String],
    metadata_paths: &[String],
    user_host: &str,
    remote_store: &Path,
    force: bool,
    quiet: bool,
) -> Result<(), String> {
    let tmp_dir = std::env::temp_dir().join("hod-rsync-staging");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| format!("error creating temp dir: {e}"))?;

    if !quiet {
        eprintln!(
            "[hod] rsync: transferring {} paths to {user_host}:{}",
            content_paths.len() + metadata_paths.len(),
            remote_store.display(),
        );
    }

    let regular_filelist = if content_paths.is_empty() {
        None
    } else {
        Some(write_rsync_file_list(&tmp_dir, content_paths)?)
    };
    let metadata_filelist = if metadata_paths.is_empty() {
        None
    } else {
        Some(write_rsync_file_list(&tmp_dir, metadata_paths)?)
    };

    if let Some(ref filelist) = regular_filelist {
        run_rsync_transfer(store_root, filelist, user_host, remote_store, !force)?;
    }

    // Always refresh mutable metadata like hod.db, even during incremental
    // transfers. Skipping it can leave the destination with stale recipe→output
    // mappings while the staged outputs themselves are up to date.
    if let Some(ref filelist) = metadata_filelist {
        run_rsync_transfer(store_root, filelist, user_host, remote_store, false)?;
    }

    if !quiet {
        eprintln!("[hod] transfer complete");
    }

    if let Some(filelist) = regular_filelist {
        let _ = std::fs::remove_file(filelist);
    }
    if let Some(filelist) = metadata_filelist {
        let _ = std::fs::remove_file(filelist);
    }

    Ok(())
}

/// Transfer files locally (cp -r).
fn transfer_local(
    store_root: &Path,
    rel_paths: &[String],
    dest: &Path,
    force: bool,
    quiet: bool,
) -> Result<(), String> {
    // Ensure destination exists
    std::fs::create_dir_all(dest)
        .map_err(|e| format!("error creating destination {}: {e}", dest.display()))?;

    if !quiet {
        eprintln!(
            "[hod] copying {} paths to {}",
            rel_paths.len(),
            dest.display(),
        );
    }

    let mut copied = 0usize;
    let mut skipped = 0usize;

    for rel in rel_paths {
        let src = store_root.join(rel);
        let dst = dest.join(rel);

        let src_meta = match std::fs::symlink_metadata(&src) {
            Ok(meta) => meta,
            Err(_) => {
                continue; // Source doesn't exist, skip
            }
        };

        if src_meta.file_type().is_symlink() {
            let always_refresh = rel == "hod.db";
            if dst.exists() && !force && !always_refresh {
                skipped += 1;
                continue;
            }

            if let Some(parent) = dst.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("error creating dir {}: {e}", parent.display()))?;
            }

            if dst.exists() || std::fs::symlink_metadata(&dst).is_ok() {
                remove_existing_path(&dst)
                    .map_err(|e| format!("error removing {}: {e}", dst.display()))?;
            }

            let target = std::fs::read_link(&src)
                .map_err(|e| format!("error reading symlink {rel}: {e}"))?;
            #[cfg(unix)]
            std::os::unix::fs::symlink(&target, &dst)
                .map_err(|e| format!("error copying symlink {rel}: {e}"))?;
            #[cfg(not(unix))]
            return Err(format!(
                "copying symlink {rel} is unsupported on this platform"
            ));

            copied += 1;
            continue;
        }

        if src_meta.is_dir() {
            if dst.exists() && !force {
                skipped += 1;
                continue;
            }
            std::fs::create_dir_all(&dst)
                .map_err(|e| format!("error creating dir {}: {e}", dst.display()))?;
            copied += 1;
            continue;
        }

        let always_refresh = rel == "hod.db";
        if dst.exists() && !force && !always_refresh {
            skipped += 1;
            continue; // Already exists, skip (incremental)
        }

        // Ensure parent directory exists
        if let Some(parent) = dst.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("error creating dir {}: {e}", parent.display()))?;
        }

        if dst.exists() || std::fs::symlink_metadata(&dst).is_ok() {
            remove_existing_path(&dst)
                .map_err(|e| format!("error removing {}: {e}", dst.display()))?;
        }

        std::fs::copy(&src, &dst).map_err(|e| format!("error copying {rel}: {e}"))?;

        copied += 1;
    }

    if !quiet {
        eprintln!(
            "[hod] copy complete: {} transferred, {} skipped (already present)",
            copied, skipped,
        );
    }

    Ok(())
}

fn remove_existing_path(path: &Path) -> std::io::Result<()> {
    let meta = std::fs::symlink_metadata(path)?;
    if meta.is_dir() && !meta.file_type().is_symlink() {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Compute the total size of a directory tree.
fn dir_size(path: &Path) -> std::io::Result<u64> {
    let mut total = 0u64;
    if path.is_file() {
        total += std::fs::symlink_metadata(path)?.len();
    } else if path.is_symlink() {
        // Symlinks are small; count the link itself
        total += std::fs::symlink_metadata(path)?.len();
    } else if path.is_dir() {
        for entry in std::fs::read_dir(path)? {
            let entry = entry?;
            let meta = entry.metadata()?;
            if meta.is_dir() {
                total += dir_size(&entry.path())?;
            } else {
                total += meta.len();
            }
        }
        // Count the directory entry itself
        total += std::fs::symlink_metadata(path)?.len();
    }
    Ok(total)
}

/// Format a byte count as a human-readable size string.
fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;
    const GB: u64 = 1024 * MB;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.0} KB", bytes as f64 / KB as f64)
    } else {
        format!("{bytes} B")
    }
}

/// Get a short summary of key files in a staging directory.
///
/// Shows binaries in `bin/` and shared libraries in `lib/` (up to 3).
fn summarize_staging(path: &Path) -> String {
    let mut parts: Vec<String> = Vec::new();

    // Check bin/
    if let Ok(entries) = std::fs::read_dir(path.join("bin")) {
        let binaries: Vec<String> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file() || e.path().is_symlink())
            .map(|e| format!("bin/{}", e.file_name().to_string_lossy()))
            .collect();
        parts.extend(binaries);
    }

    // Check lib/*.so (just list up to 3)
    if let Ok(entries) = std::fs::read_dir(path.join("lib")) {
        let libs: Vec<String> = entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                name.contains(".so")
            })
            .map(|e| format!("lib/{}", e.file_name().to_string_lossy()))
            .collect();
        if !libs.is_empty() {
            if libs.len() <= 3 {
                parts.extend(libs);
            } else {
                parts.extend(libs[..3].to_vec());
                parts.push(format!("+ {} more libs", libs.len() - 3));
            }
        }
    }

    parts.join(", ")
}

/// Format a recipe type for display.
fn format_recipe_type(recipe: &Recipe) -> &'static str {
    match recipe {
        Recipe::File(_) => "file",
        Recipe::Directory(_) => "directory",
        Recipe::Symlink(_) => "symlink",
        Recipe::Download(_) => "download",
        Recipe::Process(_) => "process",
        Recipe::Unpack(_) => "unpack",
        Recipe::GitFetch(_) => "git-fetch",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_size() {
        assert_eq!(format_size(0), "0 B");
        assert_eq!(format_size(512), "512 B");
        assert_eq!(format_size(1024), "1 KB");
        assert_eq!(format_size(1024 * 1024), "1.0 MB");
        assert_eq!(format_size(1024 * 1024 * 1024), "1.0 GB");
        assert_eq!(format_size(1536), "2 KB");
        assert_eq!(format_size(1024 * 512), "512 KB");
        assert_eq!(format_size(1024 * 1024 * 512), "512.0 MB");
    }

    #[test]
    fn test_parse_destination_local_absolute() {
        let dest = parse_destination("/tmp/store", None).unwrap();
        match dest {
            Destination::Local { path } => {
                assert_eq!(path, PathBuf::from("/tmp/store"));
            }
            _ => panic!("expected local destination"),
        }
    }

    #[test]
    fn test_parse_destination_local_relative() {
        let dest = parse_destination("./store", None).unwrap();
        match dest {
            Destination::Local { path } => {
                assert!(path.is_absolute());
                assert!(path.ends_with("store"));
            }
            _ => panic!("expected local destination"),
        }
    }

    #[test]
    fn test_parse_destination_ssh_default() {
        let dest = parse_destination("user@host", None).unwrap();
        match dest {
            Destination::Ssh {
                user_host,
                remote_store,
            } => {
                assert_eq!(user_host, "user@host");
                // Default remote store should be ~/.local/share/hod
                assert!(remote_store.to_string_lossy().contains("hod"));
            }
            _ => panic!("expected SSH destination"),
        }
    }

    #[test]
    fn test_parse_destination_ssh_with_path() {
        let dest = parse_destination("user@host:/opt/hod", None).unwrap();
        match dest {
            Destination::Ssh {
                user_host,
                remote_store,
            } => {
                assert_eq!(user_host, "user@host");
                assert_eq!(remote_store, PathBuf::from("/opt/hod"));
            }
            _ => panic!("expected SSH destination"),
        }
    }

    #[test]
    fn test_parse_destination_remote_store_override_wins() {
        let override_path = Path::new("/custom/store");
        let dest = parse_destination("user@host:/inline/path", Some(override_path)).unwrap();
        match dest {
            Destination::Ssh { remote_store, .. } => {
                assert_eq!(remote_store, PathBuf::from("/custom/store"));
            }
            _ => panic!("expected SSH destination"),
        }
    }

    #[test]
    fn collect_relative_paths_includes_hidden_files() {
        let tmp = tempfile::TempDir::new().unwrap();
        let root = tmp.path();
        let output = root.join("staging/f4/output/bin");
        std::fs::create_dir_all(&output).unwrap();
        std::fs::write(output.join("alacritty"), b"wrapper").unwrap();
        std::fs::write(output.join(".alacritty-wrapped"), b"elf").unwrap();

        let mut paths = BTreeSet::new();
        collect_relative_paths(root, &root.join("staging/f4/output"), &mut paths).unwrap();

        assert!(paths.contains("staging/f4/output"));
        assert!(paths.contains("staging/f4/output/bin"));
        assert!(paths.contains("staging/f4/output/bin/alacritty"));
        assert!(paths.contains("staging/f4/output/bin/.alacritty-wrapped"));
    }
}
