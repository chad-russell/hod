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
use hod::hash::{hash_bytes, hex_to_hash, hash_to_hex};
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
    /// Build a recipe and all its transitive dependencies.
    Build {
        /// Path to the `.hod` recipe file to build. Mutually exclusive with --hash.
        recipe_file: Option<PathBuf>,

        /// BLAKE3 hash (hex, 64 characters) of a recipe already in the store.
        /// Mutually exclusive with <recipe-file>.
        #[arg(long)]
        hash: Option<String>,

        /// Override store location.
        #[arg(long)]
        store: Option<PathBuf>,

        /// Rebuild the specified recipe even if output is cached.
        /// Dependencies are still served from cache. Use --force-recursive
        /// to also rebuild all transitive dependencies.
        #[arg(long)]
        force: bool,

        /// Rebuild the recipe and all transitive dependencies unconditionally.
        #[arg(long)]
        force_recursive: bool,

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

    /// Encode a JSON recipe file to binary .hod format.
    Encode {
        /// Path to the JSON recipe file to encode.
        json_file: PathBuf,

        /// Write the binary .hod output to this path.
        #[arg(long)]
        output: Option<PathBuf>,
    },

    /// Decode a binary .hod recipe file to JSON.
    Decode {
        /// Path to the binary .hod recipe file to decode.
        hod_file: PathBuf,

        /// Write the JSON output to this path (stdout if omitted).
        #[arg(long)]
        output: Option<PathBuf>,
    },

    /// Compute the BLAKE3 hash of a file.
    #[command(name = "hash-file")]
    HashFile {
        /// Path to the file to hash.
        file: PathBuf,
    },

    /// Import a .hod recipe file into the store.
    ImportRecipe {
        /// Path to the `.hod` recipe file to import.
        recipe_file: PathBuf,

        /// Override store location.
        #[arg(long)]
        store: Option<PathBuf>,
    },

    /// Import a recipe from JSON on stdin into the store. Prints the recipe hash.
    #[command(name = "import-from-json")]
    ImportFromJson {
        /// Override store location.
        #[arg(long)]
        store: Option<PathBuf>,
    },

    /// Inspect a recipe in the store by hash. Prints JSON to stdout.
    Inspect {
        /// BLAKE3 hash (hex, 64 characters) of the recipe to inspect.
        hash: String,

        /// Override store location.
        #[arg(long)]
        store: Option<PathBuf>,
    },

    /// Import a file as a content blob into the store. Prints the BLAKE3 hash.
    #[command(name = "import-blob")]
    ImportBlob {
        /// Path to the file to import as a blob.
        file: PathBuf,

        /// Override store location.
        #[arg(long)]
        store: Option<PathBuf>,
    },

    /// Export a recipe binary from the store to a file.
    #[command(name = "export-recipe")]
    ExportRecipe {
        /// BLAKE3 hash (hex, 64 characters) of the recipe to export.
        hash: String,

        /// Write the binary .hod output to this path.
        #[arg(long)]
        output: PathBuf,

        /// Override store location.
        #[arg(long)]
        store: Option<PathBuf>,
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
            hash,
            store,
            force,
            force_recursive,
            keep_failed,
            quiet,
            verbose,
        } => cmd_build(recipe_file, hash, store, force, force_recursive, keep_failed, quiet, verbose),
        Commands::LsOutput {
            hash,
            store,
            long,
            recursive,
        } => cmd_ls_output(hash, store, long, recursive),
        Commands::Encode { json_file, output } => cmd_encode(json_file, output),
        Commands::Decode { hod_file, output } => cmd_decode(hod_file, output),
        Commands::HashFile { file } => cmd_hash_file(file),
        Commands::ImportRecipe { recipe_file, store } => cmd_import_recipe(recipe_file, store),
        Commands::ImportFromJson { store } => cmd_import_from_json(store),
        Commands::Inspect { hash, store } => cmd_inspect(hash, store),
        Commands::ImportBlob { file, store } => cmd_import_blob(file, store),
        Commands::ExportRecipe { hash, output, store } => cmd_export_recipe(hash, output, store),
    }
}

// ---------------------------------------------------------------------------
// `hod build`
// ---------------------------------------------------------------------------

fn cmd_build(
    recipe_file: Option<PathBuf>,
    hash_str: Option<String>,
    store_path: Option<PathBuf>,
    force: bool,
    force_recursive: bool,
    keep_failed: bool,
    quiet: bool,
    verbose: bool,
) -> ! {
    // Validate mutual exclusivity
    match (&recipe_file, &hash_str) {
        (Some(_), Some(_)) => {
            eprintln!("hod: cannot specify both <recipe-file> and --hash");
            process::exit(3);
        }
        (None, None) => {
            eprintln!("hod: must specify either <recipe-file> or --hash");
            process::exit(3);
        }
        _ => {}
    }

    // Open the store (needed for both paths)
    let config = StoreConfig { path: store_path };
    let store = match Store::open(&config) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: store error: {e}");
            process::exit(10);
        }
    };

    // Obtain recipe bytes from file or store
    let recipe_bytes = if let Some(ref path) = recipe_file {
        match std::fs::read(&path) {
            Ok(bytes) => bytes,
            Err(e) => {
                eprintln!("hod: error reading {}: {e}", path.display());
                process::exit(3);
            }
        }
    } else {
        // --hash path: retrieve from store
        let hash = match hex_to_hash(hash_str.as_ref().unwrap()) {
            Some(h) => h,
            None => {
                eprintln!(
                    "hod: invalid hash: '{}' (expected 64 hex characters)",
                    hash_str.as_ref().unwrap()
                );
                process::exit(3);
            }
        };
        match store.get_recipe(&hash) {
            Ok(bytes) => bytes,
            Err(e) => {
                eprintln!("hod: {e}");
                process::exit(4);
            }
        }
    };

    if verbose {
        eprintln!(
            "[hod] store: {}",
            store.root().display(),
        );
        if let Some(ref path) = recipe_file {
            eprintln!(
                "[hod] recipe file: {} ({} bytes)",
                path.display(),
                recipe_bytes.len(),
            );
        } else {
            eprintln!(
                "[hod] recipe hash: {} ({} bytes from store)",
                hash_str.as_ref().unwrap(),
                recipe_bytes.len(),
            );
        }
    }

    let options = BuildOptions {
        force,
        force_recursive,
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

// ---------------------------------------------------------------------------
// `hod encode`
// ---------------------------------------------------------------------------

fn cmd_encode(json_file: PathBuf, output: Option<PathBuf>) -> ! {
    use hod::recipe::Recipe;

    let json_str = match std::fs::read_to_string(&json_file) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: error reading {}: {e}", json_file.display());
            process::exit(1);
        }
    };

    let recipe: Recipe = match serde_json::from_str(&json_str) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("hod: error parsing JSON: {e}");
            process::exit(1);
        }
    };

    let encoded = recipe.encode();
    let hash_hex = hash_to_hex(&hash_bytes(&encoded));

    if let Some(out_path) = output {
        if let Err(e) = std::fs::write(&out_path, &encoded) {
            eprintln!("hod: error writing {}: {e}", out_path.display());
            process::exit(1);
        }
    }

    // Print the recipe hash to stdout
    println!("{hash_hex}");
    process::exit(0);
}

// ---------------------------------------------------------------------------
// `hod decode`
// ---------------------------------------------------------------------------

fn cmd_decode(hod_file: PathBuf, output: Option<PathBuf>) -> ! {
    use hod::recipe::Recipe;

    let hod_bytes = match std::fs::read(&hod_file) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("hod: error reading {}: {e}", hod_file.display());
            process::exit(1);
        }
    };

    let recipe: Recipe = match Recipe::decode(&hod_bytes) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("hod: error decoding .hod file: {e}");
            process::exit(1);
        }
    };

    let json = serde_json::to_string_pretty(&recipe).unwrap();

    match output {
        Some(out_path) => {
            if let Err(e) = std::fs::write(&out_path, json.as_bytes()) {
                eprintln!("hod: error writing {}: {e}", out_path.display());
                process::exit(1);
            }
        }
        None => print!("{json}"),
    }

    process::exit(0);
}

// ---------------------------------------------------------------------------
// `hod hash-file`
// ---------------------------------------------------------------------------

fn cmd_hash_file(file: PathBuf) -> ! {
    let data = match std::fs::read(&file) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("hod: error reading {}: {e}", file.display());
            process::exit(1);
        }
    };

    let hash_hex = hash_to_hex(&hash_bytes(&data));
    println!("{hash_hex}");
    process::exit(0);
}

// ---------------------------------------------------------------------------
// `hod import-recipe`
// ---------------------------------------------------------------------------

fn cmd_import_recipe(recipe_file: PathBuf, store_path: Option<PathBuf>) -> ! {
    let recipe_bytes = match std::fs::read(&recipe_file) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("hod: error reading {}: {e}", recipe_file.display());
            process::exit(1);
        }
    };

    // Validate it's a real recipe
    if let Err(e) = hod::recipe::Recipe::decode(&recipe_bytes) {
        eprintln!("hod: invalid recipe: {e}");
        process::exit(3);
    }

    let config = StoreConfig { path: store_path };
    let store = match Store::open(&config) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: store error: {e}");
            process::exit(10);
        }
    };

    let hash_hex = hash_to_hex(&hash_bytes(&recipe_bytes));
    store.store_recipe(&recipe_bytes).unwrap();
    println!("{hash_hex}");
    process::exit(0);
}

// ---------------------------------------------------------------------------
// `hod import-from-json`
// ---------------------------------------------------------------------------

fn cmd_import_from_json(store_path: Option<PathBuf>) -> ! {
    use std::io::Read;

    let json_str = {
        let mut buf = String::new();
        if let Err(e) = std::io::stdin().read_to_string(&mut buf) {
            eprintln!("hod: error reading stdin: {e}");
            process::exit(1);
        }
        buf
    };

    let recipe: hod::recipe::Recipe = match serde_json::from_str(&json_str) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("hod: error parsing JSON: {e}");
            process::exit(1);
        }
    };

    let recipe_bytes = recipe.encode();

    let config = StoreConfig { path: store_path };
    let store = match Store::open(&config) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: store error: {e}");
            process::exit(10);
        }
    };

    let hash_hex = hash_to_hex(&hash_bytes(&recipe_bytes));
    store.store_recipe(&recipe_bytes).unwrap();
    println!("{hash_hex}");
    process::exit(0);
}

// ---------------------------------------------------------------------------
// `hod inspect`
// ---------------------------------------------------------------------------

fn cmd_inspect(hash_str: String, store_path: Option<PathBuf>) -> ! {
    let hash = match hex_to_hash(&hash_str) {
        Some(h) => h,
        None => {
            eprintln!("hod: invalid hash: '{hash_str}' (expected 64 hex characters)");
            process::exit(3);
        }
    };

    let config = StoreConfig { path: store_path };
    let store = match Store::open(&config) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: store error: {e}");
            process::exit(10);
        }
    };

    let recipe_bytes = match store.get_recipe(&hash) {
        Ok(bytes) => bytes,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(4);
        }
    };

    let recipe = match hod::recipe::Recipe::decode(&recipe_bytes) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("hod: error decoding recipe: {e}");
            process::exit(3);
        }
    };

    let json = serde_json::to_string_pretty(&recipe).unwrap();
    println!("{json}");
    process::exit(0);
}

// ---------------------------------------------------------------------------
// `hod export-recipe`
// ---------------------------------------------------------------------------

fn cmd_export_recipe(hash_str: String, output: PathBuf, store_path: Option<PathBuf>) -> ! {
    let hash = match hex_to_hash(&hash_str) {
        Some(h) => h,
        None => {
            eprintln!("hod: invalid hash: '{hash_str}' (expected 64 hex characters)");
            process::exit(3);
        }
    };

    let config = StoreConfig { path: store_path };
    let store = match Store::open(&config) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: store error: {e}");
            process::exit(10);
        }
    };

    let recipe_bytes = match store.get_recipe(&hash) {
        Ok(bytes) => bytes,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(4);
        }
    };

    if let Err(e) = std::fs::write(&output, &recipe_bytes) {
        eprintln!("hod: error writing {}: {e}", output.display());
        process::exit(1);
    }

    eprintln!("Exported recipe {hash_str} to {}", output.display());
    process::exit(0);
}

// ---------------------------------------------------------------------------
// `hod import-blob`
// ---------------------------------------------------------------------------

fn cmd_import_blob(file: PathBuf, store_path: Option<PathBuf>) -> ! {
    let data = match std::fs::read(&file) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("hod: error reading {}: {e}", file.display());
            process::exit(1);
        }
    };

    let config = StoreConfig { path: store_path };
    let store = match Store::open(&config) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: store error: {e}");
            process::exit(10);
        }
    };

    let hash = match store.write_blob(&data) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("hod: error writing blob: {e}");
            process::exit(10);
        }
    };

    println!("{}", hash_to_hex(&hash));
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
