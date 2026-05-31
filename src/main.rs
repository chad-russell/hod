//! Hod CLI — command-line interface for the deterministic build system.
//!
//! This file defines the clap surface and dispatches to the Rust modules that
//! implement each subcommand.

use std::collections::{BTreeMap, HashSet, VecDeque};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process;

use clap::{Parser, Subcommand};

use hod::build::{self, BuildOptions};
use hod::hash::{hash_bytes, hash_to_hex, hex_to_hash};
use hod::recipe::Recipe;
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
        /// Path to a `.hod` recipe file or `.ts` recipe module to build. Mutually exclusive with --hash.
        recipe_file: Option<PathBuf>,

        /// BLAKE3 hash (hex, 64 characters) of a recipe already in the store.
        /// Mutually exclusive with <recipe-file>.
        #[arg(long)]
        hash: Option<String>,

        /// Override store location.
        #[arg(long)]
        store: Option<PathBuf>,

        /// Rebuild the specified recipe even if output is cached.
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

    /// Reset the store: delete all recipes, outputs, blobs, and build logs.
    Reset {
        /// Override store location.
        #[arg(long)]
        store: Option<PathBuf>,
    },

    /// Re-run relocation + wrapping on a built recipe.
    ///
    /// Re-applies the ELF RUNPATH patching and wrapper generation using the
    /// current hod binary, without rebuilding the recipe. Requires that the
    /// pre-relocation build output is still in the staging directory.
    ///
    /// Useful after fixing a bug in hod's relocation code.
    ///
    /// Examples:
    ///   hod restage 29d529cad00387beb158f426a7e4f9f96db23710a3a6c7836265fd16d70ae15d
    ///   hod restage ./recipes/native/alacritty/alacritty.ts
    Restage {
        /// Recipe specifier: a 64-char hex hash or a path to a .ts file.
        specifier: String,

        /// Override store location.
        #[arg(long)]
        store: Option<PathBuf>,
    },

    /// Build all recipes in the store that have no cached output yet.
    ///
    /// Discovers unbuilt recipes via topological sort of the dependency
    /// graph, then builds them in dependency order. Useful after evaluating
    /// all TypeScript recipes with `bun run` to perform a full rebuild.
    #[command(name = "build-remaining")]
    BuildRemaining {
        /// Override store location.
        #[arg(long)]
        store: Option<PathBuf>,

        /// Suppress stdout/stderr streaming from build processes.
        #[arg(long, short)]
        quiet: bool,

        /// Keep the sandbox working directory on build failure.
        #[arg(long)]
        keep_failed: bool,
    },

    /// Build the current graph reachable from an explicit roots file.
    #[command(name = "build-roots")]
    BuildRoots {
        /// File containing one recipe hash per line. Text after whitespace or # is ignored.
        #[arg(long)]
        roots_file: PathBuf,

        /// Override store location.
        #[arg(long)]
        store: Option<PathBuf>,

        /// Suppress stdout/stderr streaming from build processes.
        #[arg(long, short)]
        quiet: bool,

        /// Keep the sandbox working directory on failure.
        #[arg(long)]
        keep_failed: bool,
    },

    /// Run a command from a built package.
    ///
    /// Accepts a recipe specifier (64-char hex hash or path to a .ts file).
    /// If no command is given, auto-detects the binary in the package's bin/.
    /// If the first argument starts with `-`, it is treated as a flag to the
    /// auto-detected binary.
    ///
    /// Examples:
    ///   hod run ./recipes/native/jq/jq.ts
    ///   hod run ./recipes/native/jq/jq.ts --version
    ///   hod run ./recipes/native/jq/jq.ts -- jq --version
    ///   hod run 47301f... -- jq --version
    Run {
        /// Recipe specifier: a 64-char hex hash or a path to a .ts file.
        specifier: String,

        /// Command and arguments to run.
        ///
        /// If omitted, auto-detects the binary in the package's bin/.
        /// If the first arg starts with `-`, it is passed as a flag to the
        /// auto-detected binary.
        #[arg(last = true, allow_hyphen_values = true)]
        command: Vec<String>,

        /// Override store location.
        #[arg(long)]
        store: Option<PathBuf>,
    },

    /// Enter a shell environment with packages on PATH.
    ///
    /// Accepts a recipe specifier (64-char hex hash or path to a .ts file)
    /// and spawns $SHELL with PATH, LD_LIBRARY_PATH, etc. set.
    ///
    /// Example:
    ///   hod shell ./recipes/native/jq/jq.ts
    ///   hod shell <hash> --command 'rg pattern'
    Shell {
        /// Recipe specifier: a 64-char hex hash or a path to a .ts file.
        specifier: String,

        /// Override store location.
        #[arg(long)]
        store: Option<PathBuf>,

        /// Run a command in the shell instead of spawning interactive.
        #[arg(short, long)]
        command: Option<String>,

        /// Additional args to pass to $SHELL (with --command).
        #[arg(short, long)]
        arg: Vec<String>,
    },

    /// Garbage-collect store objects unreachable from configured roots.
    #[command(name = "gc")]
    Gc {
        /// Additional roots file. May be passed more than once.
        #[arg(long = "roots-file")]
        roots_files: Vec<PathBuf>,

        /// Override store location.
        #[arg(long)]
        store: Option<PathBuf>,

        /// Print what would be removed without deleting anything.
        #[arg(long)]
        dry_run: bool,
    },

    /// Inspect the runtime closure of a recipe.
    ///
    /// Resolves and displays all runtime dependencies transitively,
    /// showing sizes and key files for each entry.
    ///
    /// Examples:
    ///   hod closure ./recipes/native/yad/yad.ts
    ///   hod closure 76930b...
    Closure {
        /// Recipe specifier: a 64-char hex hash or a path to a .ts file.
        specifier: String,

        /// Override store location.
        #[arg(long)]
        store: Option<PathBuf>,
    },

    /// Copy a recipe's runtime closure to another store.
    ///
    /// Transfers staging directories, recipe files, and the database
    /// for all entries in the closure. Uses rsync for SSH destinations
    /// and cp for local targets.
    ///
    /// Without --to, produces a tar.zst archive.
    ///
    /// Examples:
    ///   hod copy-closure 76930b... --to user@thinkpad
    ///   hod copy-closure 76930b... --to /mnt/cache/hod
    ///   hod copy-closure 76930b... --list
    ///   hod copy-closure 76930b... --archive -o yad-closure.tar.zst
    #[command(name = "copy-closure")]
    CopyClosure {
        /// Recipe specifier: a 64-char hex hash or a path to a .ts file.
        specifier: String,

        /// Copy TO this destination. Formats:
        ///   user@host         (remote via SSH, default store path)
        ///   user@host:path    (remote via SSH, custom store path)
        ///   /absolute/path    (local directory)
        ///   ./relative/path   (local directory, relative to CWD)
        /// Default without --to: produce a tar.zst archive.
        #[arg(long)]
        to: Option<String>,

        /// Copy FROM this source. Same format as --to.
        /// Default: the local store.
        #[arg(long)]
        from: Option<String>,

        /// Override the SOURCE store path.
        #[arg(long)]
        store: Option<PathBuf>,

        /// Override the DESTINATION store path on the remote
        /// (default: ~/.local/share/hod). Only applies with SSH --to.
        #[arg(long)]
        remote_store: Option<PathBuf>,

        /// Show what would be copied without copying.
        #[arg(short = 'n', long)]
        dry_run: bool,

        /// List all output hashes + sizes in the closure (machine-readable).
        #[arg(short = 'l', long)]
        list: bool,

        /// Produce a self-contained tar.zst archive (default when no --to).
        #[arg(long)]
        archive: bool,

        /// Write archive to this file (for --archive).
        #[arg(short, long)]
        output: Option<PathBuf>,

        /// Overwrite existing files on the destination.
        #[arg(long)]
        force: bool,

        /// Suppress progress output.
        #[arg(short, long)]
        quiet: bool,
    },

    /// Print the resolved store root path to stdout.
    ///
    /// Useful for scripts that need to know where the store lives
    /// (e.g. bootc image builder, closure staging).
    StoreRoot {
        /// Override store location.
        #[arg(long)]
        store: Option<PathBuf>,
    },

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

    /// Manage system profiles.
    ///
    /// System profiles define the running OS, parallel to user profiles
    /// which define a per-user shell environment. See
    /// `docs/system-profiles.md` for the full model.
    System {
        #[command(subcommand)]
        action: SystemAction,

        /// Override store location.
        #[arg(long, global = true)]
        store: Option<PathBuf>,

        /// Suppress build output.
        #[arg(long, global = true, short)]
        quiet: bool,
    },
}

#[derive(Subcommand)]
enum ProfileAction {
    /// Activate a profile: build, create symlink farm, write env.sh.
    Activate {
        /// Path to the profile .ts file.
        profile_file: PathBuf,
    },

    /// Activate a profile from an explicit recipe-hash list.
    #[command(name = "activate-hashes")]
    ActivateHashes {
        /// Profile name for the symlink farm.
        name: String,

        /// File containing one package recipe hash per line. Text after whitespace or # is ignored.
        #[arg(long)]
        hashes_file: PathBuf,
    },

    /// Build all packages in a profile without activating.
    Build {
        /// Path to the profile .ts file.
        profile_file: PathBuf,
    },

    /// Build, copy, verify, and activate a profile on a remote machine.
    Copy {
        /// Path to the profile .ts file.
        profile_file: PathBuf,

        /// Remote destination. Formats: user@host or user@host:/store/path.
        #[arg(long)]
        to: String,

        /// Override the remote profile name.
        #[arg(long)]
        name: Option<String>,

        /// Remote hod command to use for activation.
        #[arg(long, default_value = "hod")]
        remote_hod: String,

        /// Overwrite existing store files on the destination.
        #[arg(long)]
        force: bool,

        /// Pin the deployed profile as a GC root on the destination.
        #[arg(long)]
        pin: bool,
    },

    /// Pin a profile's package recipe hashes as GC roots.
    Pin {
        /// Path to the profile .ts file.
        profile_file: PathBuf,

        /// Override the roots file profile name.
        #[arg(long)]
        name: Option<String>,
    },

    /// Remove a pinned profile roots file.
    Unpin {
        /// Profile name to unpin.
        name: String,
    },

    /// List roots files under ~/.hod/roots/.
    Roots,
}

#[derive(Subcommand)]
enum SystemAction {
    /// Build the closure of a system profile without activating.
    Build {
        /// Path to the system profile .ts file.
        profile_file: PathBuf,
    },

    /// Build, materialize a new generation, and switch `current` to it.
    Activate {
        /// Path to the system profile .ts file.
        profile_file: PathBuf,
    },

    /// List system generations.
    List,

    /// Switch `current` to the previous generation.
    Rollback,

    /// Pin a system profile's recipe hashes as GC roots without activating.
    Pin {
        /// Path to the system profile .ts file.
        profile_file: PathBuf,
    },

    /// Remove the system roots GC pin.
    Unpin,
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
            keep_failed,
            quiet,
            verbose,
        } => cmd_build(recipe_file, hash, store, force, keep_failed, quiet, verbose),
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
        Commands::ExportRecipe {
            hash,
            output,
            store,
        } => cmd_export_recipe(hash, output, store),
        Commands::Reset { store } => cmd_reset(store),
        Commands::Restage { specifier, store } => cmd_restage(specifier, store),
        Commands::BuildRemaining {
            store,
            quiet,
            keep_failed,
        } => cmd_build_remaining(store, quiet, keep_failed),
        Commands::BuildRoots {
            roots_file,
            store,
            quiet,
            keep_failed,
        } => cmd_build_roots(roots_file, store, quiet, keep_failed),
        Commands::Run {
            specifier,
            command,
            store,
        } => cmd_run(specifier, command, store),
        Commands::Shell {
            specifier,
            store,
            command,
            arg,
        } => cmd_shell(specifier, store, command, arg),
        Commands::Gc {
            roots_files,
            store,
            dry_run,
        } => cmd_gc(roots_files, store, dry_run),
        Commands::Profile {
            action,
            store,
            quiet,
        } => cmd_profile(action, store, quiet),
        Commands::System {
            action,
            store,
            quiet,
        } => cmd_system(action, store, quiet),
        Commands::Closure { specifier, store } => cmd_closure(specifier, store),
        Commands::StoreRoot { store } => cmd_store_root(store),
        Commands::CopyClosure {
            specifier,
            to,
            from,
            store,
            remote_store,
            dry_run,
            list,
            archive,
            output,
            force,
            quiet,
        } => cmd_copy_closure(
            specifier,
            to,
            from,
            store,
            remote_store,
            dry_run,
            list,
            archive,
            output,
            force,
            quiet,
        ),
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

    // Obtain recipe bytes from a .hod file, a .ts module, or the store.
    let mut resolved_ts_hash: Option<String> = None;
    let recipe_bytes = if let Some(ref path) = recipe_file {
        if path.extension().and_then(|ext| ext.to_str()) == Some("ts") {
            let specifier = path.to_string_lossy();
            let recipe_hash = match hod::run::resolve_specifier_no_build(&specifier, &config) {
                Ok(resolved) => resolved.recipe_hash,
                Err(e) => {
                    eprintln!("hod: {e}");
                    process::exit(4);
                }
            };
            resolved_ts_hash = Some(hash_to_hex(&recipe_hash));
            match store.get_recipe(&recipe_hash) {
                Ok(bytes) => bytes,
                Err(e) => {
                    eprintln!("hod: {e}");
                    process::exit(4);
                }
            }
        } else {
            match std::fs::read(&path) {
                Ok(bytes) => bytes,
                Err(e) => {
                    eprintln!("hod: error reading {}: {e}", path.display());
                    process::exit(3);
                }
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
        eprintln!("[hod] store: {}", store.root().display(),);
        if let Some(ref path) = recipe_file {
            if let Some(hash) = resolved_ts_hash.as_ref() {
                eprintln!(
                    "[hod] recipe module: {} → {} ({} bytes from store)",
                    path.display(),
                    hash,
                    recipe_bytes.len(),
                );
            } else {
                eprintln!(
                    "[hod] recipe file: {} ({} bytes)",
                    path.display(),
                    recipe_bytes.len(),
                );
            }
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

fn cmd_ls_output(hash_str: String, store_path: Option<PathBuf>, long: bool, recursive: bool) -> ! {
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
// `hod store-root`
// ---------------------------------------------------------------------------

fn cmd_store_root(store_path: Option<PathBuf>) -> ! {
    let config = StoreConfig { path: store_path };
    println!("{}", config.resolve().display());
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
// `hod reset`
// ---------------------------------------------------------------------------

fn cmd_reset(store_path: Option<PathBuf>) -> ! {
    let config = StoreConfig { path: store_path };
    let root = config.resolve();

    if !root.exists() {
        eprintln!("hod: store not found at {}", root.display());
        process::exit(0);
    }

    match std::fs::remove_dir_all(&root) {
        Ok(()) => {
            eprintln!("hod: reset store at {}", root.display());
            process::exit(0);
        }
        Err(e) => {
            eprintln!("hod: error removing store: {e}");
            process::exit(10);
        }
    }
}

// ---------------------------------------------------------------------------
// `hod restage`
// ---------------------------------------------------------------------------

fn cmd_restage(specifier: String, store_path: Option<PathBuf>) {
    let store_config = StoreConfig {
        path: store_path.clone(),
    };

    let recipe_hash = match hod::run::resolve_specifier(&specifier, &store_config) {
        Ok(resolved) => resolved.recipe_hash,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(4);
        }
    };

    let store = match Store::open(&store_config) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: error opening store: {e}");
            process::exit(10);
        }
    };

    match crate::build::restage_output(&store, &recipe_hash) {
        Ok(_hash) => {}
        Err(e) => {
            eprintln!("hod: restage failed: {e}");
            process::exit(10);
        }
    }
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// `hod run`
// ---------------------------------------------------------------------------

fn cmd_run(specifier: String, command: Vec<String>, store_path: Option<PathBuf>) -> ! {
    let store_config = StoreConfig {
        path: store_path.clone(),
    };

    // Resolve specifier to recipe hash
    let recipe_hash = match hod::run::resolve_specifier(&specifier, &store_config) {
        Ok(resolved) => resolved.recipe_hash,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(4);
        }
    };

    // Open store and resolve staging paths
    let store = match Store::open(&store_config) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: store error: {e}");
            process::exit(10);
        }
    };

    let staging_path = match hod::run::resolve_staging_path(&store, &recipe_hash) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(4);
        }
    };

    let env = hod::run::build_env(&[staging_path.clone()]);

    // Resolve the command: either explicit or auto-detected from bin/
    let (cmd, args) = hod::run::resolve_run_command(&staging_path, &command);

    match hod::run::exec_command(env, &cmd, &args) {
        Ok(()) => process::exit(0),
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(1);
        }
    }
}

// ---------------------------------------------------------------------------
// `hod shell`
// ---------------------------------------------------------------------------

fn cmd_shell(
    specifier: String,
    store_path: Option<PathBuf>,
    command: Option<String>,
    args: Vec<String>,
) -> ! {
    let store_config = StoreConfig {
        path: store_path.clone(),
    };

    // Resolve specifier to recipe hash
    let recipe_hash = match hod::run::resolve_specifier(&specifier, &store_config) {
        Ok(resolved) => resolved.recipe_hash,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(4);
        }
    };

    // Open store and resolve staging path
    let store = match Store::open(&store_config) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: store error: {e}");
            process::exit(10);
        }
    };

    let staging_path = match hod::run::resolve_staging_path(&store, &recipe_hash) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(4);
        }
    };

    let env = hod::run::build_env(&[staging_path]);

    match hod::run::exec_shell(env, command.as_deref(), &args) {
        Ok(()) => process::exit(0),
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(1);
        }
    }
}

// ---------------------------------------------------------------------------
// Root-set helpers, `hod build-roots`, and `hod gc`
// ---------------------------------------------------------------------------

fn read_roots_file(path: &Path) -> std::result::Result<Vec<[u8; 32]>, String> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("error reading {}: {e}", path.display()))?;
    let mut roots = Vec::new();
    let mut seen = HashSet::new();
    for (idx, line) in text.lines().enumerate() {
        let before_comment = line.split('#').next().unwrap_or("").trim();
        if before_comment.is_empty() {
            continue;
        }
        let hash_text = before_comment
            .split_whitespace()
            .next()
            .unwrap_or(before_comment);
        let hash = hex_to_hash(hash_text).ok_or_else(|| {
            format!(
                "{}:{}: invalid recipe hash '{}'; expected 64 lowercase hex chars",
                path.display(),
                idx + 1,
                hash_text,
            )
        })?;
        if seen.insert(hash) {
            roots.push(hash);
        }
    }
    if roots.is_empty() {
        return Err(format!("{} contains no recipe roots", path.display()));
    }
    Ok(roots)
}

fn read_profile_packages_file(
    path: &Path,
) -> std::result::Result<Vec<hod::profile::ProfilePackage>, String> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("error reading {}: {e}", path.display()))?;
    let mut packages = Vec::new();
    let mut seen = HashSet::new();
    for (idx, line) in text.lines().enumerate() {
        let before_comment = line.split('#').next().unwrap_or("").trim();
        if before_comment.is_empty() {
            continue;
        }
        let mut parts = before_comment.split_whitespace();
        let hash_text = parts.next().unwrap_or(before_comment);
        let hash = hex_to_hash(hash_text).ok_or_else(|| {
            format!(
                "{}:{}: invalid recipe hash '{}'; expected 64 lowercase hex chars",
                path.display(),
                idx + 1,
                hash_text,
            )
        })?;
        if seen.insert(hash) {
            packages.push(hod::profile::ProfilePackage {
                name: parts.next().map(|s| s.to_string()),
                hash,
            });
        }
    }
    if packages.is_empty() {
        return Err(format!("{} contains no profile packages", path.display()));
    }
    Ok(packages)
}

fn roots_dir() -> PathBuf {
    if let Ok(p) = std::env::var("HOD_ROOTS_DIR") {
        return PathBuf::from(p);
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    PathBuf::from(home).join(".hod/roots")
}

fn profile_roots_path(name: &str) -> PathBuf {
    roots_dir().join(format!("profile-{name}.txt"))
}

fn read_default_roots_files() -> std::result::Result<Vec<PathBuf>, String> {
    let dir = roots_dir();
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut files = Vec::new();
    for entry in std::fs::read_dir(&dir)
        .map_err(|e| format!("error reading roots dir {}: {e}", dir.display()))?
    {
        let entry = entry.map_err(|e| format!("error reading roots dir {}: {e}", dir.display()))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("txt") {
            files.push(path);
        }
    }
    files.sort();
    Ok(files)
}

fn read_roots_files(paths: &[PathBuf]) -> std::result::Result<Vec<[u8; 32]>, String> {
    let mut roots = Vec::new();
    let mut seen = HashSet::new();
    for path in paths {
        for root in read_roots_file(path)? {
            if seen.insert(root) {
                roots.push(root);
            }
        }
    }
    Ok(roots)
}

fn recipe_dependencies(recipe: &Recipe) -> Vec<[u8; 32]> {
    match recipe {
        Recipe::File(f) => f.resources_hash.iter().copied().collect(),
        Recipe::Directory(d) => d.entries.iter().map(|e| e.entry_hash).collect(),
        Recipe::Symlink(_) | Recipe::Download(_) | Recipe::GitFetch(_) => Vec::new(),
        Recipe::Unpack(u) => u.archive_recipe_hash.iter().copied().collect(),
        Recipe::Process(p) => {
            let mut deps: Vec<[u8; 32]> = p.dependencies.iter().map(|d| d.recipe_hash).collect();
            if let Some(h) = p.workdir_hash {
                deps.push(h);
            }
            if let Some(h) = p.output_scaffold_hash {
                deps.push(h);
            }
            deps
        }
    }
}

fn recipe_blob_references(recipe: &Recipe) -> Vec<[u8; 32]> {
    match recipe {
        Recipe::File(f) => vec![f.content_blob_hash],
        Recipe::Download(d) => vec![d.expected_hash],
        Recipe::Unpack(u) => vec![u.archive_hash],
        Recipe::Directory(_) | Recipe::Symlink(_) | Recipe::Process(_) | Recipe::GitFetch(_) => {
            Vec::new()
        }
    }
}

fn reachable_runtime_closure_recipes(
    store: &Store,
    roots: &[[u8; 32]],
) -> std::result::Result<HashSet<[u8; 32]>, String> {
    let mut seen = HashSet::new();
    let mut queue: VecDeque<[u8; 32]> = roots.iter().copied().collect();

    while let Some(hash) = queue.pop_front() {
        if !seen.insert(hash) {
            continue;
        }

        let bytes = store
            .get_recipe(&hash)
            .map_err(|e| format!("error loading recipe {}: {e}", hash_to_hex(&hash)))?;
        let recipe = Recipe::decode(&bytes)
            .map_err(|e| format!("invalid recipe {}: {e}", hash_to_hex(&hash)))?;

        for dep in recipe_dependencies(&recipe) {
            queue.push_back(dep);
        }

        if let Recipe::Process(p) = &recipe {
            if let Some(runtime_dep_names) = &p.runtime_deps {
                for dep_name in runtime_dep_names {
                    let dep = p
                        .dependencies
                        .iter()
                        .find(|d| d.name == *dep_name)
                        .ok_or_else(|| {
                            format!(
                                "runtime_dep '{}' not found in dependencies of {}",
                                dep_name,
                                hash_to_hex(&hash),
                            )
                        })?;
                    queue.push_back(dep.recipe_hash);
                }
            }
        }
    }

    Ok(seen)
}

fn cmd_build_roots(
    roots_file: PathBuf,
    store_path: Option<PathBuf>,
    quiet: bool,
    keep_failed: bool,
) -> ! {
    let roots = match read_roots_file(&roots_file) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(1);
        }
    };
    let store = match Store::open(&StoreConfig { path: store_path }) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: store error: {e}");
            process::exit(10);
        }
    };
    let options = BuildOptions {
        force: false,
        quiet,
        keep_failed,
    };

    eprintln!(
        "[hod] building {} root recipe(s) from {}",
        roots.len(),
        roots_file.display()
    );
    for (idx, root) in roots.iter().enumerate() {
        let hex = hash_to_hex(root);
        eprintln!("[hod] root [{}/{}] {}", idx + 1, roots.len(), hex);
        let bytes = match store.get_recipe(root) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("hod: error loading root recipe {hex}: {e}");
                process::exit(10);
            }
        };
        match build::build(&store, &bytes, &options) {
            Ok(output) => eprintln!(
                "[hod] root [{}/{}] {} → {}",
                idx + 1,
                roots.len(),
                hex,
                hash_to_hex(&output)
            ),
            Err(e) => {
                eprintln!(
                    "hod: root [{}/{}] FAILED {}: {e}",
                    idx + 1,
                    roots.len(),
                    hex
                );
                process::exit(e.exit_code());
            }
        }
    }
    eprintln!("[hod] build-roots complete");
    process::exit(0);
}

fn mark_staging_blobs(path: &Path, live_blobs: &mut HashSet<[u8; 32]>) -> std::io::Result<()> {
    let meta = std::fs::symlink_metadata(path)?;
    if meta.file_type().is_symlink() {
        return Ok(());
    }
    if meta.is_file() {
        let data = std::fs::read(path)?;
        live_blobs.insert(hash_bytes(&data));
    } else if meta.is_dir() {
        for entry in std::fs::read_dir(path)? {
            mark_staging_blobs(&entry?.path(), live_blobs)?;
        }
    }
    Ok(())
}

fn iter_sharded_files(root: &Path) -> std::io::Result<Vec<(String, PathBuf)>> {
    let mut files = Vec::new();
    if !root.exists() {
        return Ok(files);
    }
    for shard in std::fs::read_dir(root)? {
        let shard = shard?;
        if !shard.file_type()?.is_dir() {
            continue;
        }
        for entry in std::fs::read_dir(shard.path())? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().to_string();
            files.push((name, entry.path()));
        }
    }
    Ok(files)
}

fn remove_path(path: &Path, dry_run: bool) -> std::io::Result<()> {
    if dry_run {
        return Ok(());
    }
    let meta = std::fs::symlink_metadata(path)?;
    if meta.is_dir() && !meta.file_type().is_symlink() {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    }
}

fn cmd_gc(roots_files: Vec<PathBuf>, store_path: Option<PathBuf>, dry_run: bool) -> ! {
    let mut all_roots_files = match read_default_roots_files() {
        Ok(files) => files,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(1);
        }
    };
    all_roots_files.extend(roots_files);

    if all_roots_files.is_empty() {
        eprintln!(
            "hod: no roots files found. Add *.txt roots under {} or pass --roots-file.",
            roots_dir().display()
        );
        process::exit(1);
    }

    let roots = match read_roots_files(&all_roots_files) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(1);
        }
    };
    let store = match Store::open(&StoreConfig { path: store_path }) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: store error: {e}");
            process::exit(10);
        }
    };
    let live_recipes = match reachable_runtime_closure_recipes(&store, &roots) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(10);
        }
    };

    eprintln!(
        "[hod] gc roots: {} recipe root(s) from {} roots file(s)",
        roots.len(),
        all_roots_files.len(),
    );

    let mut live_outputs = HashSet::new();
    let mut live_blobs = HashSet::new();

    for recipe_hash in &live_recipes {
        if let Ok(bytes) = store.get_recipe(recipe_hash) {
            if let Ok(recipe) = Recipe::decode(&bytes) {
                for blob in recipe_blob_references(&recipe) {
                    live_blobs.insert(blob);
                }
            }
        }
        match store.get_output(recipe_hash) {
            Ok(Some(output)) => {
                live_outputs.insert(output);
                let staging = build::artifact_staging_path(&store, &output);
                if staging.exists() {
                    if let Err(e) = mark_staging_blobs(&staging, &mut live_blobs) {
                        eprintln!(
                            "[hod] warning: could not scan staging {}: {e}",
                            staging.display()
                        );
                    }
                }
            }
            Ok(None) => {}
            Err(e) => eprintln!(
                "[hod] warning: could not read output for {}: {e}",
                hash_to_hex(recipe_hash)
            ),
        }
        if let Ok(Some(log)) = store.get_build_log(recipe_hash) {
            if let Some(h) = log.stdout_blob {
                live_blobs.insert(h);
            }
            if let Some(h) = log.stderr_blob {
                live_blobs.insert(h);
            }
        }
    }

    let mut removed_recipes = 0usize;
    for (hex, hash) in store.list_recipes().unwrap_or_default() {
        if !live_recipes.contains(&hash) {
            let path = store.recipes_dir().join(&hex[..2]).join(&hex);
            if path.exists() {
                if let Err(e) = remove_path(&path, dry_run) {
                    eprintln!(
                        "[hod] warning: could not remove recipe {}: {e}",
                        path.display()
                    );
                }
            }
            if !dry_run {
                let _ = store.conn().execute(
                    "DELETE FROM recipes WHERE recipe_hash = ?1",
                    rusqlite::params![hex],
                );
            }
            removed_recipes += 1;
        }
    }

    let mut removed_outputs = 0usize;
    if let Ok(mut stmt) = store.conn().prepare("SELECT recipe_hash FROM outputs") {
        let rows = stmt.query_map([], |row| row.get::<_, String>(0));
        if let Ok(rows) = rows {
            for hex_recipe in rows.flatten() {
                if let Some(recipe_hash) = hex_to_hash(&hex_recipe) {
                    if !live_recipes.contains(&recipe_hash) {
                        if !dry_run {
                            let _ = store.conn().execute(
                                "DELETE FROM outputs WHERE recipe_hash = ?1",
                                rusqlite::params![hex_recipe],
                            );
                        }
                        removed_outputs += 1;
                    }
                }
            }
        }
    }

    let mut removed_logs = 0usize;
    if let Ok(mut stmt) = store.conn().prepare("SELECT recipe_hash FROM build_logs") {
        let rows = stmt.query_map([], |row| row.get::<_, String>(0));
        if let Ok(rows) = rows {
            for hex_recipe in rows.flatten() {
                if let Some(recipe_hash) = hex_to_hash(&hex_recipe) {
                    if !live_recipes.contains(&recipe_hash) {
                        if !dry_run {
                            let _ = store.conn().execute(
                                "DELETE FROM build_logs WHERE recipe_hash = ?1",
                                rusqlite::params![hex_recipe],
                            );
                        }
                        removed_logs += 1;
                    }
                }
            }
        }
    }

    if !dry_run {
        let live_hex: Vec<String> = live_recipes.iter().map(hash_to_hex).collect();
        if live_hex.is_empty() {
            let _ = store.conn().execute("DELETE FROM dependencies", []);
        } else {
            // Simpler and deterministic: remove dependency rows whose recipe is not live one by one.
            if let Ok(mut stmt) = store
                .conn()
                .prepare("SELECT DISTINCT recipe_hash FROM dependencies")
            {
                if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
                    for hex_recipe in rows.flatten() {
                        if let Some(recipe_hash) = hex_to_hash(&hex_recipe) {
                            if !live_recipes.contains(&recipe_hash) {
                                let _ = store.conn().execute(
                                    "DELETE FROM dependencies WHERE recipe_hash = ?1",
                                    rusqlite::params![hex_recipe],
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    let mut removed_staging = 0usize;
    match iter_sharded_files(&store.staging_dir()) {
        Ok(entries) => {
            for (hex, path) in entries {
                let keep = hex_to_hash(&hex)
                    .map(|h| live_outputs.contains(&h))
                    .unwrap_or(false);
                if !keep {
                    if let Err(e) = remove_path(&path, dry_run) {
                        eprintln!(
                            "[hod] warning: could not remove staging {}: {e}",
                            path.display()
                        );
                    }
                    removed_staging += 1;
                }
            }
        }
        Err(e) => eprintln!("[hod] warning: could not list staging: {e}"),
    }

    let mut removed_blobs = 0usize;
    match iter_sharded_files(&store.blobs_dir()) {
        Ok(entries) => {
            for (hex, path) in entries {
                let keep = hex_to_hash(&hex)
                    .map(|h| live_blobs.contains(&h))
                    .unwrap_or(false);
                if !keep {
                    if let Err(e) = remove_path(&path, dry_run) {
                        eprintln!(
                            "[hod] warning: could not remove blob {}: {e}",
                            path.display()
                        );
                    }
                    removed_blobs += 1;
                }
            }
        }
        Err(e) => eprintln!("[hod] warning: could not list blobs: {e}"),
    }

    if !dry_run {
        let _ = std::fs::remove_dir_all(store.tmp_dir());
        let _ = std::fs::create_dir_all(store.tmp_dir());
    }

    eprintln!(
        "[hod] gc{} complete: live recipes={}, live outputs={}, live blobs={}, removed recipes={}, outputs={}, logs={}, staging={}, blobs={}",
        if dry_run { " dry-run" } else { "" },
        live_recipes.len(),
        live_outputs.len(),
        live_blobs.len(),
        removed_recipes,
        removed_outputs,
        removed_logs,
        removed_staging,
        removed_blobs,
    );
    process::exit(0);
}

// ---------------------------------------------------------------------------
// `hod profile`
// ---------------------------------------------------------------------------

fn cmd_profile(action: ProfileAction, store_path: Option<PathBuf>, quiet: bool) -> ! {
    let store_config = StoreConfig { path: store_path };

    let (profile_file, activate) = match action {
        ProfileAction::Activate { profile_file } => (profile_file, true),
        ProfileAction::ActivateHashes { name, hashes_file } => {
            let packages = match read_profile_packages_file(&hashes_file) {
                Ok(packages) => packages,
                Err(e) => {
                    eprintln!("hod: {e}");
                    process::exit(3);
                }
            };

            let store = match Store::open(&store_config) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("hod: store error: {e}");
                    process::exit(10);
                }
            };

            let farm_dir = match hod::profile::create_farm_from_packages(&store, &name, &packages) {
                Ok(dir) => dir,
                Err(e) => {
                    eprintln!("hod: {e}");
                    process::exit(10);
                }
            };

            eprintln!("[hod] symlink farm: {}/", farm_dir.display());
            eprintln!("[hod] activated. Add to your shell config:");
            eprintln!("    source {}/env.sh", farm_dir.display());
            process::exit(0);
        }
        ProfileAction::Build { profile_file } => (profile_file, false),
        ProfileAction::Copy {
            profile_file,
            to,
            name,
            remote_hod,
            force,
            pin,
        } => cmd_profile_copy(
            profile_file,
            to,
            name,
            remote_hod,
            store_config,
            quiet,
            force,
            pin,
        ),
        ProfileAction::Pin { profile_file, name } => {
            cmd_profile_pin(profile_file, name, store_config)
        }
        ProfileAction::Unpin { name } => cmd_profile_unpin(name),
        ProfileAction::Roots => cmd_profile_roots(),
    };

    // Evaluate the profile module via Bun
    eprintln!("[hod] evaluating profile {}", profile_file.display());
    let (name, packages) = match hod::profile::evaluate_profile(&profile_file, &store_config) {
        Ok(result) => result,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(4);
        }
    };
    let hashes = hod::profile::package_hashes(&packages);

    eprintln!("[hod] profile '{}': {} package(s)", name, hashes.len());

    // Open store and build unbuilt packages
    let store = match Store::open(&store_config) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: store error: {e}");
            process::exit(10);
        }
    };

    match hod::profile::build_profile(&store, &hashes, quiet) {
        Ok(built) => {
            if built > 0 {
                eprintln!("[hod] built {} package(s)", built);
            }
        }
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(1);
        }
    }

    if activate {
        // Create symlink farm
        let farm_dir = match hod::profile::create_farm_from_packages(&store, &name, &packages) {
            Ok(dir) => dir,
            Err(e) => {
                eprintln!("hod: {e}");
                process::exit(10);
            }
        };

        let home = std::env::var("HOME").unwrap_or_else(|_| "$HOME".to_string());
        let env_path = format!("{home}/.hod/profiles/{name}/env.sh");

        eprintln!("[hod] symlink farm: {}/", farm_dir.display());
        eprintln!("[hod] activated. Add to your shell config:");
        eprintln!("    source {env_path}");
    }

    process::exit(0);
}

fn cmd_profile_copy(
    profile_file: PathBuf,
    destination: String,
    name_override: Option<String>,
    remote_hod: String,
    store_config: StoreConfig,
    quiet: bool,
    force: bool,
    pin: bool,
) -> ! {
    eprintln!("[hod] evaluating profile {}", profile_file.display());
    let (profile_name, packages) =
        match hod::profile::evaluate_profile(&profile_file, &store_config) {
            Ok((name, packages)) => (name_override.unwrap_or(name), packages),
            Err(e) => {
                eprintln!("hod: {e}");
                process::exit(4);
            }
        };
    let hashes = hod::profile::package_hashes(&packages);

    eprintln!(
        "[hod] profile '{}': {} package(s)",
        profile_name,
        hashes.len()
    );

    let store = match Store::open(&store_config) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: store error: {e}");
            process::exit(10);
        }
    };

    match hod::profile::build_profile(&store, &hashes, quiet) {
        Ok(built) => {
            if built > 0 {
                eprintln!("[hod] built {} package(s)", built);
            }
        }
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(1);
        }
    }

    let dest = match hod::closure::parse_destination(&destination, None) {
        Ok(hod::closure::Destination::Ssh {
            user_host,
            remote_store,
        }) => (user_host, remote_store),
        Ok(hod::closure::Destination::Local { .. }) => {
            eprintln!("hod: profile copy currently requires an SSH destination");
            process::exit(3);
        }
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(3);
        }
    };

    let (remote_target, remote_store) = dest;
    let mut verify_entries: BTreeMap<String, (String, Option<u64>)> = BTreeMap::new();

    eprintln!("[hod] copying package closures to {destination}");
    for hash in &hashes {
        let hex = hash_to_hex(hash);
        if !quiet {
            eprintln!("[hod] copy {hex}");
        }

        let closure = match hod::closure::resolve_closure(&store, hash) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("hod: {e}");
                process::exit(10);
            }
        };

        let unbuilt: Vec<_> = closure
            .entries
            .iter()
            .filter(|e| e.output_hash.is_none())
            .collect();
        if !unbuilt.is_empty() {
            eprintln!("hod: closure for {hex} contains unbuilt entries");
            process::exit(4);
        }

        for entry in &closure.entries {
            if let Some(output_hash) = entry.output_hash {
                verify_entries.insert(
                    hash_to_hex(&entry.recipe_hash),
                    (hash_to_hex(&output_hash), entry.staging_size),
                );
            }
        }

        let copy_dest = hod::closure::Destination::Ssh {
            user_host: remote_target.clone(),
            remote_store: remote_store.clone(),
        };
        if let Err(e) =
            hod::closure::copy_closure(&store, &closure, &copy_dest, false, force, quiet)
        {
            eprintln!("hod: {e}");
            process::exit(10);
        }
    }

    if let Err(e) = verify_remote_profile_copy(&remote_target, &remote_store, &verify_entries) {
        eprintln!("hod: {e}");
        process::exit(10);
    }

    if let Err(e) = activate_remote_profile(
        &remote_target,
        &remote_store,
        &remote_hod,
        &profile_name,
        &packages,
        pin,
    ) {
        eprintln!("hod: {e}");
        process::exit(10);
    }

    eprintln!("[hod] deployed profile '{profile_name}' to {remote_target}");
    process::exit(0);
}

fn profile_roots_content(name: &str, source: Option<&Path>, hashes: &[[u8; 32]]) -> String {
    let mut content = String::new();
    content.push_str(&format!("# hod roots: profile {name}\n"));
    if let Some(source) = source {
        content.push_str(&format!("# generated from: {}\n", source.display()));
    }
    content.push_str("# one recipe hash per line\n");
    for hash in hashes {
        content.push_str(&hash_to_hex(hash));
        content.push('\n');
    }
    content
}

fn cmd_profile_pin(
    profile_file: PathBuf,
    name_override: Option<String>,
    store_config: StoreConfig,
) -> ! {
    eprintln!("[hod] evaluating profile {}", profile_file.display());
    let (profile_name, packages) =
        match hod::profile::evaluate_profile(&profile_file, &store_config) {
            Ok((name, packages)) => (name_override.unwrap_or(name), packages),
            Err(e) => {
                eprintln!("hod: {e}");
                process::exit(4);
            }
        };
    let hashes = hod::profile::package_hashes(&packages);

    let path = profile_roots_path(&profile_name);
    if let Some(parent) = path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            eprintln!("hod: cannot create roots dir {}: {e}", parent.display());
            process::exit(10);
        }
    }

    let content = profile_roots_content(&profile_name, Some(&profile_file), &hashes);
    if let Err(e) = std::fs::write(&path, content) {
        eprintln!("hod: cannot write roots file {}: {e}", path.display());
        process::exit(10);
    }

    eprintln!(
        "[hod] pinned profile '{}' with {} root(s): {}",
        profile_name,
        hashes.len(),
        path.display(),
    );
    process::exit(0);
}

fn cmd_profile_unpin(name: String) -> ! {
    let path = profile_roots_path(&name);
    match std::fs::remove_file(&path) {
        Ok(()) => {
            eprintln!("[hod] unpinned profile '{}': {}", name, path.display());
            process::exit(0);
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            eprintln!("hod: profile '{}' is not pinned ({})", name, path.display());
            process::exit(1);
        }
        Err(e) => {
            eprintln!("hod: cannot remove roots file {}: {e}", path.display());
            process::exit(10);
        }
    }
}

fn cmd_profile_roots() -> ! {
    let files = match read_default_roots_files() {
        Ok(files) => files,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(1);
        }
    };

    if files.is_empty() {
        eprintln!("[hod] no roots files in {}", roots_dir().display());
        process::exit(0);
    }

    for file in files {
        match read_roots_file(&file) {
            Ok(roots) => println!("{} {} root(s)", file.display(), roots.len()),
            Err(e) => {
                eprintln!("hod: {e}");
                process::exit(1);
            }
        }
    }
    process::exit(0);
}

// ---------------------------------------------------------------------------
// `hod system`
// ---------------------------------------------------------------------------

fn cmd_system(action: SystemAction, store_path: Option<PathBuf>, quiet: bool) -> ! {
    let store_config = StoreConfig { path: store_path };

    match action {
        SystemAction::List => cmd_system_list(),
        SystemAction::Rollback => cmd_system_rollback(),
        SystemAction::Unpin => cmd_system_unpin(),
        SystemAction::Pin { profile_file } => cmd_system_pin(profile_file, store_config),
        SystemAction::Build { profile_file } => {
            cmd_system_build_or_activate(profile_file, store_config, quiet, false)
        }
        SystemAction::Activate { profile_file } => {
            cmd_system_build_or_activate(profile_file, store_config, quiet, true)
        }
    }
}

fn cmd_system_build_or_activate(
    profile_file: PathBuf,
    store_config: StoreConfig,
    quiet: bool,
    activate: bool,
) -> ! {
    eprintln!("[hod] evaluating system profile {}", profile_file.display());
    let (name, packages) = match hod::profile::evaluate_profile(&profile_file, &store_config) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(4);
        }
    };
    let hashes = hod::profile::package_hashes(&packages);
    eprintln!(
        "[hod] system profile '{}': {} package(s)",
        name,
        hashes.len()
    );

    let store = match Store::open(&store_config) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: store error: {e}");
            process::exit(10);
        }
    };

    match hod::profile::build_profile(&store, &hashes, quiet) {
        Ok(built) => {
            if built > 0 {
                eprintln!("[hod] built {} package(s)", built);
            }
        }
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(1);
        }
    }

    if !activate {
        process::exit(0);
    }

    let (generation, gen_dir) = match hod::system::build_generation(&store, &name, &packages) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(10);
        }
    };
    eprintln!(
        "[hod] materialized generation {} at {}",
        generation,
        gen_dir.display()
    );

    if let Err(e) = hod::system::activate_generation(generation, &name, &hashes) {
        eprintln!("hod: activation failed: {e}");
        process::exit(10);
    }

    let current = hod::system::system_dir().join("current");
    eprintln!(
        "[hod] activated system profile '{}' (generation {}) at {}",
        name,
        generation,
        current.display()
    );
    process::exit(0);
}

fn cmd_system_list() -> ! {
    let gens = match hod::system::list_generations() {
        Ok(g) => g,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(10);
        }
    };

    if gens.is_empty() {
        eprintln!("[hod] no system generations");
        process::exit(0);
    }

    for entry in gens {
        let marker = if entry.is_current { "*" } else { " " };
        let name = entry
            .metadata
            .as_ref()
            .map(|m| m.profile_name.as_str())
            .unwrap_or("(unknown)");
        let created = entry
            .metadata
            .as_ref()
            .map(|m| m.created_at.as_str())
            .unwrap_or("(unknown)");
        let pkg_count = entry
            .metadata
            .as_ref()
            .map(|m| m.recipe_hashes.len())
            .unwrap_or(0);
        println!(
            "{} {:>4}  {}  {}  {} package(s)",
            marker, entry.generation, created, name, pkg_count
        );
    }
    process::exit(0);
}

fn cmd_system_rollback() -> ! {
    match hod::system::rollback() {
        Ok(gen) => {
            eprintln!("[hod] rolled back to generation {gen}");
            process::exit(0);
        }
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(1);
        }
    }
}

fn cmd_system_pin(profile_file: PathBuf, store_config: StoreConfig) -> ! {
    eprintln!("[hod] evaluating system profile {}", profile_file.display());
    let (name, packages) = match hod::profile::evaluate_profile(&profile_file, &store_config) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(4);
        }
    };
    let hashes = hod::profile::package_hashes(&packages);

    if let Err(e) = hod::system::write_system_roots(&name, &hashes) {
        eprintln!("hod: {e}");
        process::exit(10);
    }
    eprintln!(
        "[hod] pinned system profile '{}' with {} root(s)",
        name,
        hashes.len()
    );
    process::exit(0);
}

fn cmd_system_unpin() -> ! {
    match hod::system::remove_system_roots() {
        Ok(true) => {
            eprintln!("[hod] removed system GC root pin");
            process::exit(0);
        }
        Ok(false) => {
            eprintln!("hod: no system roots pin to remove");
            process::exit(1);
        }
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(10);
        }
    }
}

fn verify_remote_profile_copy(
    remote_target: &str,
    remote_store: &Path,
    entries: &BTreeMap<String, (String, Option<u64>)>,
) -> Result<(), String> {
    let mut manifest = String::new();
    for (recipe_hash, (output_hash, size)) in entries {
        let size = size
            .map(|s| s.to_string())
            .unwrap_or_else(|| "-".to_string());
        manifest.push_str(&format!("{recipe_hash} {output_hash} {size}\n"));
    }

    let mut local_manifest = tempfile_path("hod-profile-verify".to_string());
    local_manifest.set_extension("txt");
    std::fs::write(&local_manifest, manifest)
        .map_err(|e| format!("failed to write verification manifest: {e}"))?;

    let remote_manifest = format!("/tmp/hod-profile-verify-{}.txt", process::id());
    let scp_target = format!("{remote_target}:{remote_manifest}");
    let scp_status = process::Command::new("scp")
        .arg("-q")
        .arg(&local_manifest)
        .arg(&scp_target)
        .status()
        .map_err(|e| format!("failed to upload verification manifest: {e}"))?;
    let _ = std::fs::remove_file(&local_manifest);
    if !scp_status.success() {
        return Err(format!(
            "failed to upload verification manifest to {scp_target}"
        ));
    }

    let script = r#"
set -euo pipefail
store=$1
manifest=$2
failures=0
checked=0

while read -r recipe_hash output_hash expected_size; do
  [[ -n "${recipe_hash:-}" ]] || continue

  recipe_path="$store/recipes/${recipe_hash:0:2}/$recipe_hash"
  if [[ ! -f "$recipe_path" ]]; then
    printf '[hod] verify missing recipe: %s\n' "$recipe_path" >&2
    failures=$((failures + 1))
  fi

  staging_path="$store/staging/${output_hash:0:2}/$output_hash"
  if [[ ! -d "$staging_path" ]]; then
    printf '[hod] verify missing staging dir: %s\n' "$staging_path" >&2
    failures=$((failures + 1))
  elif [[ "$expected_size" != "-" && "$expected_size" -gt 0 ]]; then
    actual_size=$(du -sb "$staging_path" 2>/dev/null || true)
    actual_size=${actual_size%%[[:space:]]*}
    actual_size=${actual_size:-0}
    if [[ "$actual_size" -le 0 ]]; then
      printf '[hod] verify empty staging dir: %s expected=%s actual=%s\n' "$staging_path" "$expected_size" "$actual_size" >&2
      failures=$((failures + 1))
    fi
  fi

  checked=$((checked + 1))
done < "$manifest"

if [[ "$failures" -gt 0 ]]; then
  printf '[hod] verification failed: %s issue(s) across %s closure entries\n' "$failures" "$checked" >&2
  exit 1
fi

printf '[hod] verified %s closure entries in %s\n' "$checked" "$store" >&2
"#;

    let mut child = process::Command::new("ssh")
        .args([
            remote_target,
            "bash",
            "-s",
            "--",
            &remote_store.to_string_lossy(),
            &remote_manifest,
        ])
        .stdin(process::Stdio::piped())
        .stdout(process::Stdio::inherit())
        .stderr(process::Stdio::inherit())
        .spawn()
        .map_err(|e| format!("failed to run ssh verification: {e}"))?;

    {
        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| "failed to open ssh stdin".to_string())?;
        stdin
            .write_all(script.as_bytes())
            .map_err(|e| format!("failed to write verification script: {e}"))?;
    }

    let status = child
        .wait()
        .map_err(|e| format!("failed to wait for ssh verification: {e}"))?;

    let _ = process::Command::new("ssh")
        .arg(remote_target)
        .arg("rm")
        .arg("-f")
        .arg(&remote_manifest)
        .status();

    if !status.success() {
        return Err(format!(
            "remote verification failed for {remote_target}:{}",
            remote_store.display()
        ));
    }

    Ok(())
}

fn activate_remote_profile(
    remote_target: &str,
    remote_store: &Path,
    remote_hod: &str,
    profile_name: &str,
    packages: &[hod::profile::ProfilePackage],
    pin: bool,
) -> Result<(), String> {
    let mut manifest = tempfile_path(format!("hod-profile-{profile_name}-hashes"));
    manifest.set_extension("txt");

    let mut content = String::new();
    for package in packages {
        content.push_str(&hash_to_hex(&package.hash));
        if let Some(name) = &package.name {
            content.push(' ');
            content.push_str(name);
        }
        content.push('\n');
    }
    std::fs::write(&manifest, content)
        .map_err(|e| format!("failed to write temporary hash manifest: {e}"))?;

    let remote_manifest = format!(
        "/tmp/hod-profile-{}-hashes-{}.txt",
        profile_name,
        process::id()
    );

    let mut remote_hod_command = remote_hod.to_string();
    let mut remote_helper: Option<String> = None;

    let help_output = process::Command::new("ssh")
        .arg(remote_target)
        .arg(remote_hod)
        .arg("profile")
        .arg("--help")
        .output()
        .map_err(|e| format!("failed to inspect remote hod: {e}"))?;

    let remote_has_activate_hashes = help_output.status.success()
        && String::from_utf8_lossy(&help_output.stdout).contains("activate-hashes");

    if !remote_has_activate_hashes {
        let helper = format!("/tmp/hod-profile-copy-hod-{}", process::id());
        let current_exe = std::env::current_exe()
            .map_err(|e| format!("failed to resolve current hod binary: {e}"))?;
        let helper_target = format!("{remote_target}:{helper}");
        let helper_status = process::Command::new("scp")
            .arg("-q")
            .arg(&current_exe)
            .arg(&helper_target)
            .status()
            .map_err(|e| format!("failed to upload temporary remote hod helper: {e}"))?;
        if !helper_status.success() {
            return Err(format!(
                "failed to upload temporary remote hod helper to {helper_target}"
            ));
        }

        let chmod_status = process::Command::new("ssh")
            .arg(remote_target)
            .arg("chmod")
            .arg("+x")
            .arg(&helper)
            .status()
            .map_err(|e| format!("failed to chmod temporary remote hod helper: {e}"))?;
        if !chmod_status.success() {
            return Err(format!(
                "failed to chmod temporary remote hod helper {helper}"
            ));
        }

        remote_hod_command = helper.clone();
        remote_helper = Some(helper);
    }

    let scp_target = format!("{remote_target}:{remote_manifest}");
    let scp_status = process::Command::new("scp")
        .arg("-q")
        .arg(&manifest)
        .arg(&scp_target)
        .status()
        .map_err(|e| format!("failed to upload profile hash manifest: {e}"))?;
    let _ = std::fs::remove_file(&manifest);
    if !scp_status.success() {
        return Err(format!(
            "failed to upload profile hash manifest to {scp_target}"
        ));
    }

    let status = process::Command::new("ssh")
        .arg(remote_target)
        .arg(&remote_hod_command)
        .arg("profile")
        .arg("activate-hashes")
        .arg(profile_name)
        .arg("--hashes-file")
        .arg(&remote_manifest)
        .arg("--store")
        .arg(remote_store)
        .status()
        .map_err(|e| format!("failed to run remote profile activation: {e}"))?;

    let _ = process::Command::new("ssh")
        .arg(remote_target)
        .arg("rm")
        .arg("-f")
        .arg(&remote_manifest)
        .status();

    if let Some(helper) = remote_helper {
        let _ = process::Command::new("ssh")
            .arg(remote_target)
            .arg("rm")
            .arg("-f")
            .arg(&helper)
            .status();
    }

    if !status.success() {
        return Err(format!(
            "remote profile activation failed on {remote_target}"
        ));
    }

    if pin {
        let hashes = hod::profile::package_hashes(packages);
        write_remote_profile_roots(remote_target, profile_name, &hashes)?;
    }

    Ok(())
}

fn write_remote_profile_roots(
    remote_target: &str,
    profile_name: &str,
    hashes: &[hod::hash::Hash],
) -> Result<(), String> {
    let content = profile_roots_content(profile_name, None, hashes);
    let mut local_roots = tempfile_path(format!("hod-profile-{profile_name}-roots"));
    local_roots.set_extension("txt");
    std::fs::write(&local_roots, content)
        .map_err(|e| format!("failed to write temporary profile roots: {e}"))?;

    let remote_tmp = format!(
        "/tmp/hod-profile-{}-roots-{}.txt",
        profile_name,
        process::id()
    );
    let scp_target = format!("{remote_target}:{remote_tmp}");
    let scp_status = process::Command::new("scp")
        .arg("-q")
        .arg(&local_roots)
        .arg(&scp_target)
        .status()
        .map_err(|e| format!("failed to upload profile roots file: {e}"))?;
    let _ = std::fs::remove_file(&local_roots);
    if !scp_status.success() {
        return Err(format!(
            "failed to upload profile roots file to {scp_target}"
        ));
    }

    let remote_name = format!("profile-{profile_name}.txt");
    let script = r#"
set -euo pipefail
remote_tmp=$1
remote_name=$2
roots_dir="${HOD_ROOTS_DIR:-$HOME/.hod/roots}"
mkdir -p "$roots_dir"
mv "$remote_tmp" "$roots_dir/$remote_name"
"#;

    let mut child = process::Command::new("ssh")
        .args([remote_target, "bash", "-s", "--", &remote_tmp, &remote_name])
        .stdin(process::Stdio::piped())
        .stdout(process::Stdio::inherit())
        .stderr(process::Stdio::inherit())
        .spawn()
        .map_err(|e| format!("failed to install remote profile roots file: {e}"))?;

    {
        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| "failed to open ssh stdin".to_string())?;
        stdin
            .write_all(script.as_bytes())
            .map_err(|e| format!("failed to write remote roots install script: {e}"))?;
    }

    let status = child
        .wait()
        .map_err(|e| format!("failed to wait for remote roots install: {e}"))?;
    if !status.success() {
        return Err(format!(
            "failed to install remote profile roots file on {remote_target}"
        ));
    }

    eprintln!("[hod] pinned remote profile '{profile_name}' on {remote_target}");
    Ok(())
}

fn tempfile_path(prefix: String) -> PathBuf {
    std::env::temp_dir().join(format!("{}-{}", prefix, process::id()))
}

// `hod build-remaining`
// ---------------------------------------------------------------------------

fn cmd_build_remaining(store_path: Option<PathBuf>, quiet: bool, keep_failed: bool) -> ! {
    let config = StoreConfig { path: store_path };
    let store = match Store::open(&config) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: store error: {e}");
            process::exit(10);
        }
    };

    // 1. Load the full dependency graph from the DB
    let all_recipes = match store.list_recipes() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("hod: error listing recipes: {e}");
            process::exit(10);
        }
    };

    if all_recipes.is_empty() {
        eprintln!("hod: no recipes in the store");
        process::exit(0);
    }

    // 2. Topological sort using the dependency edges
    let topo_order = match topo_sort_recipes(&store, &all_recipes) {
        Ok(order) => order,
        Err(msg) => {
            eprintln!("hod: cycle in recipe graph: {msg}");
            process::exit(3);
        }
    };

    // 3. Filter to unbuilt recipes only
    let mut to_build: Vec<(String, [u8; 32])> = Vec::new();
    for (hex, hash) in &topo_order {
        match store.get_output(hash) {
            Ok(None) => to_build.push((hex.clone(), *hash)),
            Ok(Some(_)) => {} // already built
            Err(e) => {
                eprintln!("hod: error checking output for {hex}: {e}");
                process::exit(10);
            }
        }
    }

    if to_build.is_empty() {
        eprintln!("hod: all {} recipe(s) already built", all_recipes.len());
        process::exit(0);
    }

    eprintln!(
        "[hod] building {}/{} recipe(s) (remaining)",
        to_build.len(),
        all_recipes.len(),
    );

    // 4. Build each unbuilt recipe in topological order.
    let options = BuildOptions {
        force: false,
        quiet,
        keep_failed,
    };

    let mut built = 0usize;
    let total = to_build.len();

    for (i, (hex, hash)) in to_build.iter().enumerate() {
        eprintln!("[hod] [{}/{}] building {}...", i + 1, total, hex);

        let recipe_bytes = match store.get_recipe(hash) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("hod: error loading recipe {hex}: {e}");
                process::exit(10);
            }
        };

        let output_hash = match build::build(&store, &recipe_bytes, &options) {
            Ok(h) => h,
            Err(e) => {
                eprintln!("hod: [{}/{}] FAILED {}: {e}", i + 1, total, hex);
                eprintln!("[hod] built {} recipe(s) before failure", built);
                process::exit(e.exit_code());
            }
        };

        eprintln!(
            "[hod] [{}/{}] built {} → {}",
            i + 1,
            total,
            hex,
            hash_to_hex(&output_hash),
        );
        built += 1;
    }

    eprintln!(
        "[hod] build-remaining complete: {} built, {} already cached",
        built,
        all_recipes.len() - to_build.len(),
    );

    process::exit(0);
}

/// List all recipe hashes in the store.
fn topo_sort_recipes(
    store: &Store,
    all_recipes: &[(String, [u8; 32])],
) -> std::result::Result<Vec<(String, [u8; 32])>, String> {
    // Build adjacency: recipe → [dep_recipe_hash]
    let recipe_set: std::collections::HashSet<[u8; 32]> =
        all_recipes.iter().map(|(_, h)| *h).collect();

    let mut deps_of: std::collections::HashMap<[u8; 32], Vec<[u8; 32]>> =
        std::collections::HashMap::new();
    let mut in_degree: std::collections::HashMap<[u8; 32], usize> =
        std::collections::HashMap::new();

    for (_, hash) in all_recipes {
        in_degree.entry(*hash).or_insert(0);
        deps_of.entry(*hash).or_insert_with(Vec::new);

        // Load dependency edges from the DB
        if let Ok(dep_list) = store.get_dependencies(hash) {
            for (_, dep_hash) in dep_list {
                // Only count deps that are themselves recipes in the store.
                // Skip deps that are just output hashes (not recipe hashes).
                if recipe_set.contains(&dep_hash) {
                    deps_of.entry(*hash).or_default().push(dep_hash);
                    *in_degree.entry(*hash).or_insert(0) += 1;
                }
            }
        }
    }

    // Kahn's algorithm
    // Reverse the graph: we want "depends on" → "is depended on by"
    // A recipe with in_degree 0 has all its deps already built (or no deps).
    // We want to build from leaves (no deps) to roots.
    let mut reverse: std::collections::HashMap<[u8; 32], Vec<[u8; 32]>> =
        std::collections::HashMap::new();
    for (_, hash) in all_recipes {
        reverse.entry(*hash).or_default();
    }

    // Rebuild in_degree from scratch: count how many deps each recipe has
    // that are ALSO in the recipe set (i.e., need to be built first)
    let mut in_deg: std::collections::HashMap<[u8; 32], usize> = std::collections::HashMap::new();
    for (_, hash) in all_recipes {
        let dep_count = deps_of.get(hash).map(|d| d.len()).unwrap_or(0);
        in_deg.insert(*hash, dep_count);
    }

    // Build reverse adjacency: dep → [dependents]
    for (_, hash) in all_recipes {
        if let Some(deps) = deps_of.get(hash) {
            for dep in deps {
                reverse.entry(*dep).or_default().push(*hash);
            }
        }
    }

    let mut queue: std::collections::VecDeque<[u8; 32]> = std::collections::VecDeque::new();
    for (_, hash) in all_recipes {
        if in_deg.get(hash).copied().unwrap_or(0) == 0 {
            queue.push_back(*hash);
        }
    }

    let hex_map: std::collections::HashMap<[u8; 32], String> = all_recipes
        .iter()
        .map(|(hex, hash)| (*hash, hex.clone()))
        .collect();

    let mut result = Vec::with_capacity(all_recipes.len());
    while let Some(hash) = queue.pop_front() {
        let hex = hex_map
            .get(&hash)
            .cloned()
            .unwrap_or_else(|| hash_to_hex(&hash));
        result.push((hex, hash));

        if let Some(dependents) = reverse.get(&hash) {
            for dependent in dependents {
                let deg = in_deg.get_mut(dependent).unwrap();
                *deg -= 1;
                if *deg == 0 {
                    queue.push_back(*dependent);
                }
            }
        }
    }

    if result.len() != all_recipes.len() {
        return Err("dependency cycle detected".to_string());
    }

    Ok(result)
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
        let mut entries: Vec<_> = std::fs::read_dir(path)?.filter_map(|e| e.ok()).collect();
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

// ---------------------------------------------------------------------------
// `hod closure`
// ---------------------------------------------------------------------------

fn cmd_closure(specifier: String, store_path: Option<PathBuf>) -> ! {
    let store_config = StoreConfig { path: store_path };

    // Resolve specifier to recipe hash
    let recipe_hash = match hod::run::resolve_specifier(&specifier, &store_config) {
        Ok(resolved) => resolved.recipe_hash,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(4);
        }
    };

    // Open store and resolve closure
    let store = match Store::open(&store_config) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: store error: {e}");
            process::exit(10);
        }
    };

    let closure = match hod::closure::resolve_closure(&store, &recipe_hash) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(10);
        }
    };

    hod::closure::print_closure(&recipe_hash, &closure);
    process::exit(0);
}

// ---------------------------------------------------------------------------
// `hod copy-closure`
// ---------------------------------------------------------------------------

fn cmd_copy_closure(
    specifier: String,
    to: Option<String>,
    from: Option<String>,
    store_path: Option<PathBuf>,
    remote_store: Option<PathBuf>,
    dry_run: bool,
    list: bool,
    archive: bool,
    output: Option<PathBuf>,
    force: bool,
    quiet: bool,
) -> ! {
    if from.is_some() {
        eprintln!("hod: --from is not yet implemented for copy-closure");
        eprintln!("    hint: mount the remote store locally or use rsync directly");
        process::exit(3);
    }

    let store_config = StoreConfig { path: store_path };

    // Resolve specifier to recipe hash
    let recipe_hash = match hod::run::resolve_specifier(&specifier, &store_config) {
        Ok(resolved) => resolved.recipe_hash,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(4);
        }
    };

    // Open store and resolve closure
    let store = match Store::open(&store_config) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("hod: store error: {e}");
            process::exit(10);
        }
    };

    let closure = match hod::closure::resolve_closure(&store, &recipe_hash) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(10);
        }
    };

    // Check that all outputs are built
    let unbuilt: Vec<_> = closure
        .entries
        .iter()
        .filter(|e| e.output_hash.is_none())
        .collect();
    if !unbuilt.is_empty() {
        eprintln!(
            "hod: {} recipe(s) in the closure have not been built:",
            unbuilt.len()
        );
        for entry in unbuilt {
            let name = entry.dep_name.as_deref().unwrap_or("(root)");
            eprintln!("  {} ({})", name, hash_to_hex(&entry.recipe_hash));
        }
        eprintln!("Build the recipe first with: hod build --hash <hash>");
        process::exit(4);
    }

    // --list: print machine-readable closure info
    if list {
        hod::closure::print_closure_list(&closure);
        process::exit(0);
    }

    // --archive or no --to: produce a tar.zst archive
    if archive || to.is_none() {
        match hod::closure::archive_closure(&store, &closure, &output, quiet) {
            Ok(()) => process::exit(0),
            Err(e) => {
                eprintln!("hod: {e}");
                process::exit(10);
            }
        }
    }

    // Parse destination
    let dest =
        match hod::closure::parse_destination(to.as_deref().unwrap(), remote_store.as_deref()) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("hod: {e}");
                process::exit(3);
            }
        };

    // Transfer
    match hod::closure::copy_closure(&store, &closure, &dest, dry_run, force, quiet) {
        Ok(()) => process::exit(0),
        Err(e) => {
            eprintln!("hod: {e}");
            process::exit(10);
        }
    }
}

// ---------------------------------------------------------------------------
// `hod profile`
// ---------------------------------------------------------------------------

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
