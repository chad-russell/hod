//! Hod CLI — command-line interface for the deterministic build system.
//!
//! Two commands:
//! - `hod build <recipe-file>` — build a recipe and all its transitive dependencies
//! - `hod ls-output <hash>` — list the contents of a built output
//!
//! See PRD §8 for the full CLI specification.

use std::path::PathBuf;
use std::process;

use clap::{Parser, Subcommand};

use hod::build::{self, BuildOptions};
use hod::hash::{hex_to_hash, hash_to_hex};
use hod::store::{Store, StoreConfig};

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

/// Hod — a deterministic, content-addressed build system.
#[derive(Parser)]
#[command(name = "hod", version, about)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Build a recipe file and all its transitive dependencies.
    Build {
        /// Path to the `.hod` recipe file to build.
        recipe_file: PathBuf,

        /// Override store location.
        #[arg(long)]
        store: Option<PathBuf>,

        /// Rebuild even if output is cached.
        #[arg(long)]
        force: bool,

        /// Keep the sandbox working directory on build failure (for debugging).
        #[arg(long)]
        keep_failed: bool,

        /// Suppress stdout/stderr streaming from build processes.
        #[arg(long, short)]
        quiet: bool,

        /// Print detailed DAG resolution info.
        #[arg(long, short)]
        verbose: bool,
    },

    /// List the contents of a built output.
    #[command(name = "ls-output")]
    LsOutput {
        /// BLAKE3 hash (hex, 64 characters) of the output to inspect.
        hash: String,

        /// Override store location.
        #[arg(long)]
        store: Option<PathBuf>,

        /// Show file sizes and permissions.
        #[arg(long, short)]
        long: bool,

        /// Recurse into subdirectories.
        #[arg(long, short)]
        recursive: bool,
    },
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Build {
            recipe_file,
            store,
            force,
            keep_failed,
            quiet,
            verbose,
        } => cmd_build(recipe_file, store, force, keep_failed, quiet, verbose),
        Commands::LsOutput {
            hash,
            store,
            long,
            recursive,
        } => cmd_ls_output(hash, store, long, recursive),
    }
}

// ---------------------------------------------------------------------------
// `hod build`
// ---------------------------------------------------------------------------

fn cmd_build(
    recipe_file: PathBuf,
    store_path: Option<PathBuf>,
    force: bool,
    keep_failed: bool,
    quiet: bool,
    verbose: bool,
) -> ! {
    // Read the .hod file
    let recipe_bytes = match std::fs::read(&recipe_file) {
        Ok(bytes) => bytes,
        Err(e) => {
            eprintln!("hod: error reading {}: {e}", recipe_file.display());
            process::exit(3);
        }
    };

    // Open the store
    let config = StoreConfig { path: store_path };
    let store = match Store::open(&config) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: store error: {e}");
            process::exit(10);
        }
    };

    if verbose {
        eprintln!(
            "[hod] store: {}",
            store.root().display(),
        );
        eprintln!(
            "[hod] recipe file: {} ({} bytes)",
            recipe_file.display(),
            recipe_bytes.len(),
        );
    }

    let options = BuildOptions {
        force,
        quiet,
        keep_failed,
    };

    match build::build(&store, &recipe_bytes, &options) {
        Ok(output_hash) => {
            // Print the output hash to stdout (the only stdout output)
            println!("{}", hash_to_hex(&output_hash));
            process::exit(0);
        }
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(e.exit_code());
        }
    }
}

// ---------------------------------------------------------------------------
// `hod ls-output`
// ---------------------------------------------------------------------------

fn cmd_ls_output(
    hash_str: String,
    store_path: Option<PathBuf>,
    long: bool,
    recursive: bool,
) -> ! {
    // Parse the hash
    let hash = match hex_to_hash(&hash_str) {
        Some(h) => h,
        None => {
            eprintln!("hod: invalid hash: '{hash_str}' (expected 64 hex characters)");
            process::exit(3);
        }
    };

    // Open the store
    let config = StoreConfig { path: store_path };
    let store = match Store::open(&config) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: store error: {e}");
            process::exit(10);
        }
    };

    // Look up the staging path for the output hash
    let staging_path = build::artifact_staging_path(&store, &hash);
    if !staging_path.exists() {
        eprintln!("hod: output not found: {}", hash_str);
        process::exit(4);
    }

    // List the output
    if staging_path.is_file() || staging_path.is_symlink() {
        // Single-file output — just print the file info
        if long {
            match std::fs::symlink_metadata(&staging_path) {
                Ok(meta) => {
                    let size = meta.len();
                    let perms = format_permissions(&meta);
                    let suffix = if staging_path.is_symlink() {
                        match std::fs::read_link(&staging_path) {
                            Ok(target) => format!(" -> {}", target.display()),
                            Err(_) => String::new(),
                        }
                    } else {
                        String::new()
                    };
                    println!("{perms} {:>10} {}{suffix}", size, hash_str);
                }
                Err(e) => {
                    eprintln!("hod: error reading file metadata: {e}");
                    process::exit(10);
                }
            }
        } else {
            println!("{}", hash_str);
        }
    } else if let Err(e) = list_output(&staging_path, &staging_path, long, recursive) {
        eprintln!("hod: error listing output: {e}");
        process::exit(10);
    }

    process::exit(0);
}

/// List the contents of a path, printing relative paths from the root.
fn list_output(
    root: &std::path::Path,
    path: &std::path::Path,
    long: bool,
    recursive: bool,
) -> std::io::Result<()> {
    if path.is_file() || path.is_symlink() {
        let rel = path.strip_prefix(root).unwrap_or(path);
        if long {
            let meta = std::fs::symlink_metadata(path)?;
            let size = meta.len();
            let perms = format_permissions(&meta);
            let suffix = if path.is_symlink() {
                let target = std::fs::read_link(path)?;
                format!(" -> {}", target.display())
            } else {
                String::new()
            };
            println!("{perms} {:>10} {}{}", size, rel.display(), suffix);
        } else {
            println!("{}", rel.display());
        }
        return Ok(());
    }

    if path.is_dir() {
        let mut entries: Vec<_> = std::fs::read_dir(path)?
            .filter_map(|e| e.ok())
            .collect();
        entries.sort_by_key(|e| e.file_name());

        for entry in &entries {
            let entry_path = entry.path();
            let rel = entry_path.strip_prefix(root).unwrap_or(&entry_path);

            if entry_path.is_dir() {
                // For directories, always show with trailing /
                if long {
                    let meta = std::fs::symlink_metadata(&entry_path)?;
                    let perms = format_permissions(&meta);
                    println!("{perms} {:>10} {}/", "-", rel.display());
                } else {
                    println!("{}/", rel.display());
                }
                if recursive {
                    list_output(root, &entry_path, long, recursive)?;
                }
            } else if entry_path.is_symlink() {
                let target = std::fs::read_link(&entry_path)?;
                if long {
                    let meta = std::fs::symlink_metadata(&entry_path)?;
                    let size = meta.len();
                    let perms = format_permissions(&meta);
                    println!(
                        "{perms} {:>10} {} -> {}",
                        size,
                        rel.display(),
                        target.display(),
                    );
                } else {
                    println!("{}", rel.display());
                }
            } else {
                // Regular file
                if long {
                    let meta = std::fs::metadata(&entry_path)?;
                    let size = meta.len();
                    let perms = format_permissions(&meta);
                    let suffix = if is_executable(&meta) { "*" } else { "" };
                    println!("{perms} {:>10} {}{suffix}", size, rel.display());
                } else {
                    println!("{}", rel.display());
                }
            }
        }
    }

    Ok(())
}

/// Format file permissions as a Unix-like string (e.g., "drwxr-xr-x").
#[cfg(unix)]
fn format_permissions(meta: &std::fs::Metadata) -> String {
    use std::os::unix::fs::PermissionsExt;
    let mode = meta.permissions().mode();
    let file_type = if meta.is_dir() {
        'd'
    } else if meta.is_symlink() {
        'l'
    } else {
        '-'
    };
    let mut s = String::with_capacity(10);
    s.push(file_type);
    for i in (0..3).rev() {
        let bits = (mode >> (i * 3)) & 0o7;
        s.push(if bits & 0o4 != 0 { 'r' } else { '-' });
        s.push(if bits & 0o2 != 0 { 'w' } else { '-' });
        s.push(if bits & 0o1 != 0 { 'x' } else { '-' });
    }
    s
}

#[cfg(not(unix))]
fn format_permissions(_meta: &std::fs::Metadata) -> String {
    "----------".to_string()
}

/// Check if a file is executable.
#[cfg(unix)]
fn is_executable(meta: &std::fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    meta.permissions().mode() & 0o111 != 0
}

#[cfg(not(unix))]
fn is_executable(_meta: &std::fs::Metadata) -> bool {
    false
}
