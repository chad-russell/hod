//! Build orchestrator — DAG resolution, caching, and recipe-specific builders.
//!
//! The top-level `build` function is the main entry point:
//!   1. Parse the recipe from raw bytes
//!   2. Compute the recipe hash
//!   3. Store the recipe in the store
//!   4. Check output cache (skip if `--force`)
//!   5. Recursively build all dependencies
//!   6. Dispatch to the recipe-specific builder
//!   7. Record the output in the store
//!
//! See PRD §9 for the full build execution flow.

use std::path::{Path, PathBuf};
use std::time::Instant;

use crate::encoding::EncodeError;
use crate::hash::{hash_bytes, hash_to_hex, Hash};
use crate::recipe::{
    Recipe, RecipeDirectory, RecipeFile, RecipeProcess, RecipeSymlink,
    RecipeType,
};
use crate::store::Store;

// ---------------------------------------------------------------------------
// Build options
// ---------------------------------------------------------------------------

/// Options that control build behaviour.
#[derive(Debug, Clone)]
pub struct BuildOptions {
    /// Skip the output cache check and rebuild unconditionally.
    pub force: bool,
    /// Suppress streaming stdout/stderr from build processes to the terminal.
    pub quiet: bool,
    /// Keep the sandbox working directory on build failure (for debugging).
    pub keep_failed: bool,
}

impl Default for BuildOptions {
    fn default() -> Self {
        Self {
            force: false,
            quiet: false,
            keep_failed: false,
        }
    }
}

// ---------------------------------------------------------------------------
// Build error
// ---------------------------------------------------------------------------

/// Errors from the build orchestrator.
///
/// Each variant maps to a specific exit code per PRD §8.2.
#[derive(Debug)]
pub enum BuildError {
    /// The recipe binary is malformed (exit code 3).
    InvalidRecipe(EncodeError),
    /// A referenced dependency recipe hash is not in the store (exit code 4).
    DependencyNotFound {
        recipe_hash: Hash,
        dep_hash: Hash,
    },
    /// A build process exited with a non-zero status (exit code 1).
    ProcessFailed {
        recipe_hash: Hash,
        exit_code: i32,
        stdout: Vec<u8>,
        stderr: Vec<u8>,
    },
    /// Hash verification failed — downloaded content didn't match (exit code 2).
    HashMismatch {
        expected: Hash,
        got: Hash,
    },
    /// The recipe targets a different platform (exit code 5).
    PlatformMismatch {
        expected: String,
        actual: String,
    },
    /// A store-level error (exit code 10).
    Store(crate::store::StoreError),
    /// An IO error during build (exit code 10).
    Io(std::io::Error),
}

impl std::fmt::Display for BuildError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidRecipe(e) => write!(f, "invalid recipe: {e}"),
            Self::DependencyNotFound {
                recipe_hash,
                dep_hash,
            } => write!(
                f,
                "dependency not found: recipe {} references {} which is not in the store",
                hash_to_hex(recipe_hash),
                hash_to_hex(dep_hash),
            ),
            Self::ProcessFailed {
                exit_code,
                stderr,
                ..
            } => {
                write!(f, "build process failed with exit code {exit_code}")?;
                if !stderr.is_empty() {
                    let stderr_str = String::from_utf8_lossy(stderr);
                    let preview = stderr_str.chars().take(500).collect::<String>();
                    write!(f, "\n{preview}")?;
                }
                Ok(())
            }
            Self::HashMismatch { expected, got } => write!(
                f,
                "hash mismatch: expected {}, got {}",
                hash_to_hex(expected),
                hash_to_hex(got),
            ),
            Self::PlatformMismatch { expected, actual } => {
                write!(f, "platform mismatch: recipe targets \"{expected}\", current platform is \"{actual}\"")
            }
            Self::Store(e) => write!(f, "store error: {e}"),
            Self::Io(e) => write!(f, "IO error: {e}"),
        }
    }
}

impl std::error::Error for BuildError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::InvalidRecipe(e) => Some(e),
            Self::Store(e) => Some(e),
            Self::Io(e) => Some(e),
            _ => None,
        }
    }
}

impl From<EncodeError> for BuildError {
    fn from(e: EncodeError) -> Self {
        Self::InvalidRecipe(e)
    }
}

impl From<crate::store::StoreError> for BuildError {
    fn from(e: crate::store::StoreError) -> Self {
        Self::Store(e)
    }
}

impl From<std::io::Error> for BuildError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

impl BuildError {
    /// Return the exit code per PRD §8.2.
    pub fn exit_code(&self) -> i32 {
        match self {
            Self::InvalidRecipe(_) => 3,
            Self::DependencyNotFound { .. } => 4,
            Self::ProcessFailed { .. } => 1,
            Self::HashMismatch { .. } => 2,
            Self::PlatformMismatch { .. } => 5,
            Self::Store(_) | Self::Io(_) => 10,
        }
    }
}

/// Convenience alias.
pub type Result<T> = std::result::Result<T, BuildError>;

// ---------------------------------------------------------------------------
// Artifact — the result of building a recipe
// ---------------------------------------------------------------------------

/// An artifact produced by building a recipe.
///
/// Artifacts are content-addressed. A `File` artifact is a blob (content +
/// executable bit). A `Directory` artifact is a tree of named entries. A
/// `Symlink` artifact is just a target path.
#[derive(Debug, Clone)]
pub enum Artifact {
    File {
        /// Hash of the file's content blob.
        content_hash: Hash,
        /// Whether the file is executable.
        executable: bool,
    },
    Directory {
        /// Sorted list of (name, entry_artifact_hash) pairs.
        entries: Vec<(String, Hash)>,
    },
    Symlink {
        /// Symlink target path.
        target: String,
    },
}

// ---------------------------------------------------------------------------
// Top-level build entry point
// ---------------------------------------------------------------------------

/// Build a recipe from its raw binary bytes.
///
/// This is the main entry point for the build system. It:
/// 1. Parses the recipe binary
/// 2. Computes the recipe hash and stores the recipe
/// 3. Checks the output cache (unless `options.force`)
/// 4. Recursively resolves and builds dependencies
/// 5. Dispatches to the recipe-specific builder
/// 6. Records the output in the store
///
/// Returns the output hash on success.
pub fn build(store: &Store, recipe_bytes: &[u8], options: &BuildOptions) -> Result<Hash> {
    do_build(store, recipe_bytes, options, &mut std::collections::HashSet::new())
}

/// Internal recursive build with cycle detection.
fn do_build(
    store: &Store,
    recipe_bytes: &[u8],
    options: &BuildOptions,
    building: &mut std::collections::HashSet<Hash>,
) -> Result<Hash> {
    // 1. Parse the recipe
    let recipe = Recipe::decode(recipe_bytes)?;

    // 2. Compute hash and store the recipe
    let recipe_hash = hash_bytes(recipe_bytes);
    store.store_recipe(recipe_bytes)?;

    // Cycle detection
    if building.contains(&recipe_hash) {
        return Err(BuildError::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("build cycle detected at recipe {}", hash_to_hex(&recipe_hash)),
        )));
    }
    building.insert(recipe_hash);

    // 3. Check cache (unless --force)
    if !options.force {
        if let Some(cached) = store.get_output(&recipe_hash)? {
            eprintln!(
                "[hod] cache hit for {} ({})",
                format_recipe_type(recipe.recipe_type()),
                hash_to_hex(&recipe_hash),
            );
            building.remove(&recipe_hash);
            return Ok(cached);
        }
    }

    let start = Instant::now();
    eprintln!(
        "[hod] building {} {}...",
        format_recipe_type(recipe.recipe_type()),
        hash_to_hex(&recipe_hash),
    );

    // 4. Recursively build dependencies and collect their output hashes
    let dep_outputs = build_dependencies(store, &recipe, options, building)?;

    // 5. Dispatch to recipe-specific builder
    let artifact = match &recipe {
        Recipe::File(f) => build_file(store, f, &dep_outputs)?,
        Recipe::Directory(d) => build_directory(store, d, &dep_outputs)?,
        Recipe::Symlink(s) => build_symlink(s),
        Recipe::Download(dl) => crate::download::build_download(store, dl)?,
        Recipe::Process(p) => build_process(store, p, &dep_outputs, options)?,
    };

    // 6. Compute output hash and record it
    let output_hash = artifact_to_hash(&artifact);
    let elapsed = start.elapsed();

    // Stage the artifact to disk (for materialization by downstream recipes)
    stage_artifact(store, &artifact, &output_hash)?;

    store.store_output(&recipe_hash, &output_hash, elapsed.as_millis() as u64)?;

    // Record dependency edges
    let dep_edges = collect_dep_edges(&recipe, &dep_outputs);
    store.store_dependencies(&recipe_hash, &dep_edges)?;

    eprintln!(
        "[hod] built {} in {}ms → {}",
        hash_to_hex(&recipe_hash),
        elapsed.as_millis(),
        hash_to_hex(&output_hash),
    );

    building.remove(&recipe_hash);
    Ok(output_hash)
}

// ---------------------------------------------------------------------------
// Dependency resolution
// ---------------------------------------------------------------------------

/// The output hashes of a recipe's dependencies, keyed by dependency name
/// (for Process recipes) or by position.
#[derive(Debug, Clone, Default)]
struct DepOutputs {
    /// Named dependency outputs: (name, output_hash).
    named: Vec<(String, Hash)>,
    /// Unnamed dependency outputs (used by Directory entries).
    unnamed: Vec<Hash>,
}

/// Recursively build all dependencies for a recipe.
///
/// For Directory recipes, dependencies are the entry hashes (unnamed).
/// For Process recipes, dependencies are named.
/// Other recipe types have no dependencies.
fn build_dependencies(
    store: &Store,
    recipe: &Recipe,
    options: &BuildOptions,
    building: &mut std::collections::HashSet<Hash>,
) -> Result<DepOutputs> {
    let mut outputs = DepOutputs::default();

    match recipe {
        Recipe::Directory(d) => {
            for entry in &d.entries {
                let output_hash =
                    build_dependency(store, entry.entry_hash, options, building)?;
                outputs.unnamed.push(output_hash);
            }
        }
        Recipe::Process(p) => {
            for dep in &p.dependencies {
                let output_hash =
                    build_dependency(store, dep.recipe_hash, options, building)?;
                outputs.named.push((dep.name.clone(), output_hash));
            }
            // Build workdir if present
            if let Some(wd_hash) = p.workdir_hash {
                let output_hash =
                    build_dependency(store, wd_hash, options, building)?;
                outputs.named.push(("<workdir>".to_string(), output_hash));
            }
            // Build output scaffold if present
            if let Some(scaffold_hash) = p.output_scaffold_hash {
                let output_hash =
                    build_dependency(store, scaffold_hash, options, building)?;
                outputs.named.push(("<scaffold>".to_string(), output_hash));
            }
        }
        Recipe::File(f) => {
            // File may have a resources dependency
            if let Some(res_hash) = f.resources_hash {
                let output_hash =
                    build_dependency(store, res_hash, options, building)?;
                outputs.named.push(("<resources>".to_string(), output_hash));
            }
        }
        _ => {}
    }

    Ok(outputs)
}

/// Build a single dependency by its recipe hash.
///
/// The dependency recipe must already be stored in the store (i.e., its
/// `.hod` file was previously ingested). If not found, returns
/// `BuildError::DependencyNotFound`.
fn build_dependency(
    store: &Store,
    dep_recipe_hash: Hash,
    options: &BuildOptions,
    building: &mut std::collections::HashSet<Hash>,
) -> Result<Hash> {
    // Check if already built (output cache)
    if !options.force {
        if let Some(cached) = store.get_output(&dep_recipe_hash)? {
            return Ok(cached);
        }
    }

    // The recipe bytes must be in the store
    let recipe_bytes = store.get_recipe(&dep_recipe_hash).map_err(|_| {
        BuildError::DependencyNotFound {
            recipe_hash: Hash::default(), // We don't know the parent here
            dep_hash: dep_recipe_hash,
        }
    })?;

    do_build(store, &recipe_bytes, options, building)
}

/// Collect dependency edges for recording in the DB.
fn collect_dep_edges(recipe: &Recipe, dep_outputs: &DepOutputs) -> Vec<(Option<String>, Hash)> {
    let mut edges = Vec::new();

    match recipe {
        Recipe::Directory(d) => {
            for (i, entry) in d.entries.iter().enumerate() {
                if let Some(output_hash) = dep_outputs.unnamed.get(i) {
                    edges.push((Some(entry.name.clone()), *output_hash));
                }
            }
        }
        Recipe::Process(_p) => {
            // Named deps
            for (name, output_hash) in &dep_outputs.named {
                edges.push((Some(name.clone()), *output_hash));
            }
        }
        Recipe::File(f) => {
            if let Some(_) = f.resources_hash {
                if let Some((_, output_hash)) = dep_outputs.named.first() {
                    edges.push((Some("<resources>".to_string()), *output_hash));
                }
            }
        }
        _ => {}
    }

    edges
}

// ---------------------------------------------------------------------------
// Pure recipe builders
// ---------------------------------------------------------------------------

/// Build a File recipe: fetch blob, return file artifact.
///
/// If the file has `resources_hash` set (packed executable), the builder
/// produces a packed output directory with RPATH-patched binary and resources.
fn build_file(store: &Store, f: &RecipeFile, dep_outputs: &DepOutputs) -> Result<Artifact> {
    // Ensure the blob exists
    if !store.blob_exists(&f.content_blob_hash)? {
        return Err(BuildError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!(
                "content blob {} not found in store",
                hash_to_hex(&f.content_blob_hash)
            ),
        )));
    }

    // Check if this is a packed executable (has resources)
    if crate::packed::needs_packing(f) {
        // Get the resources output hash from dependencies
        let resources_output_hash = dep_outputs
            .named
            .iter()
            .find(|(name, _)| name == "<resources>")
            .map(|(_, h)| *h)
            .ok_or_else(|| {
                BuildError::Io(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "file recipe has resources_hash but resources were not built",
                ))
            })?;

        return crate::packed::build_packed_output(
            store,
            &f.content_blob_hash,
            f.executable,
            &resources_output_hash,
        );
    }

    Ok(Artifact::File {
        content_hash: f.content_blob_hash,
        executable: f.executable,
    })
}

/// Build a Directory recipe: recursively build entries, assemble directory artifact.
///
/// Each entry's recipe should have already been built by `build_dependencies`.
/// We use the output hashes from those builds.
fn build_directory(
    _store: &Store,
    d: &RecipeDirectory,
    dep_outputs: &DepOutputs,
) -> Result<Artifact> {
    // Each entry was built as an unnamed dependency; collect output hashes
    let mut entries: Vec<(String, Hash)> = Vec::with_capacity(d.entries.len());
    for (i, entry) in d.entries.iter().enumerate() {
        let output_hash = dep_outputs.unnamed[i];
        entries.push((entry.name.clone(), output_hash));
    }

    // Entries should already be sorted (enforced by decode), but verify
    for window in entries.windows(2) {
        assert!(
            window[0].0 < window[1].0,
            "directory entries not sorted: {} >= {}",
            window[0].0,
            window[1].0,
        );
    }

    Ok(Artifact::Directory { entries })
}

/// Build a Symlink recipe: return symlink artifact.
fn build_symlink(s: &RecipeSymlink) -> Artifact {
    Artifact::Symlink {
        target: s.target.clone(),
    }
}

// ---------------------------------------------------------------------------
// Process builder — uses Linux namespace sandbox on Linux, falls back to
// unsandboxed execution on other platforms
// ---------------------------------------------------------------------------

/// Build a Process recipe: set up execution environment, run command in sandbox,
/// capture output.
///
/// On Linux, this uses namespace isolation (mount, PID, IPC, UTS, network).
/// On other platforms, falls back to unsandboxed execution.
fn build_process(
    store: &Store,
    p: &RecipeProcess,
    dep_outputs: &DepOutputs,
    options: &BuildOptions,
) -> Result<Artifact> {
    // Platform check
    let current_platform = current_platform();
    if p.platform != current_platform {
        return Err(BuildError::PlatformMismatch {
            expected: p.platform.clone(),
            actual: current_platform,
        });
    }

    // Compute recipe hash for this process (for unique sandbox dir naming)
    let recipe_hash = {
        let encoded = Recipe::Process(p.clone()).encode();
        hash_bytes(&encoded)
    };

    // Create sandbox working directory in store/tmp/
    let sandbox_root = store.tmp_dir().join(format!(
        "sandbox-{}",
        &hash_to_hex(&recipe_hash)[..16],
    ));
    if sandbox_root.exists() {
        let _ = std::fs::remove_dir_all(&sandbox_root);
    }
    std::fs::create_dir_all(&sandbox_root)?;

    // Paths inside the sandbox (guest paths)
    let guest_out = PathBuf::from("/out");
    let guest_deps = PathBuf::from("/deps");
    let guest_tmp = PathBuf::from("/tmp");
    let guest_home = PathBuf::from("/homeless-shelter");

    // Host-side paths for materialized deps
    let host_deps_dir = sandbox_root.join("deps");
    std::fs::create_dir_all(&host_deps_dir)?;

    // Materialize dependency outputs into sandbox_root/deps/<name>/ on the host
    // (these will be bind-mounted or available inside the sandbox)
    let mut dep_paths: Vec<(String, PathBuf)> = Vec::new();
    for (name, output_hash) in &dep_outputs.named {
        if name.starts_with('<') {
            // Skip internal deps like <workdir>, <scaffold>
            continue;
        }
        let dep_mount = host_deps_dir.join(name);
        std::fs::create_dir_all(&dep_mount)?;
        let staging_path = artifact_staging_path(store, output_hash);
        if staging_path.is_dir() {
            copy_dir_recursive(&staging_path, &dep_mount)?;
        } else if staging_path.exists() {
            std::fs::copy(&staging_path, dep_mount.join("data"))?;
        }
        dep_paths.push((name.clone(), dep_mount));
    }

    // Handle output scaffold — pre-populate the out directory
    let host_out_dir = sandbox_root.join("out");
    std::fs::create_dir_all(&host_out_dir)?;
    if p.output_scaffold_hash.is_some() {
        for (name, output_hash) in &dep_outputs.named {
            if name == "<scaffold>" {
                materialize_artifact(store, output_hash, &host_out_dir)?;
                break;
            }
        }
    }

    // Handle workdir — copy into sandbox
    let host_workdir = sandbox_root.join("workdir");
    if p.workdir_hash.is_some() {
        std::fs::create_dir_all(&host_workdir)?;
        for (name, output_hash) in &dep_outputs.named {
            if name == "<workdir>" {
                materialize_artifact(store, output_hash, &host_workdir)?;
                break;
            }
        }
    }

    // Build environment variables (use guest paths inside the sandbox)
    let mut env = std::collections::HashMap::new();

    // Standard env vars (PRD §4.2) — point to guest paths inside the sandbox
    env.insert("OUT".to_string(), guest_out.to_string_lossy().to_string());
    env.insert("DEPS".to_string(), guest_deps.to_string_lossy().to_string());
    env.insert("TMPDIR".to_string(), guest_tmp.to_string_lossy().to_string());
    env.insert("HOME".to_string(), guest_home.to_string_lossy().to_string());
    env.insert(
        "HOD_STORE".to_string(),
        store.root().to_string_lossy().to_string(),
    );

    // User-specified env vars (override standard if conflict)
    for var in &p.env {
        env.insert(var.key.clone(), var.value.clone());
    }

    // Inherit some standard env vars from the host
    for key in &["PATH", "TERM", "LANG", "LC_ALL", "TZ"] {
        if let Ok(val) = std::env::var(key) {
            env.entry(key.to_string()).or_insert(val);
        }
    }

    // Build command args (argv[0] is the command itself)
    let mut cmd_args = vec![p.command.clone()];
    cmd_args.extend(p.args.iter().cloned());

    // Working directory inside the sandbox
    let guest_work_dir = if p.workdir_hash.is_some() {
        PathBuf::from("/workdir")
    } else {
        PathBuf::from("/")
    };

    // Determine networking permission
    let allow_networking = (p.unsafe_flags & 0x01) != 0;

    // Run the sandboxed process
    let sandbox_config = crate::sandbox::SandboxConfig {
        sandbox_root: sandbox_root.clone(),
        deps: dep_paths,
        out_path: guest_out.clone(),
        tmp_path: guest_tmp,
        home_path: guest_home,
        command: p.command.clone(),
        args: cmd_args,
        env,
        work_dir: guest_work_dir,
        allow_networking,
        keep_failed: options.keep_failed,
    };

    let result = crate::sandbox::run_sandboxed(sandbox_config)?;

    // Stream output if not quiet
    if !options.quiet {
        if !result.stdout.is_empty() {
            let _ = std::io::Write::write_all(&mut std::io::stdout(), &result.stdout);
        }
        if !result.stderr.is_empty() {
            let _ = std::io::Write::write_all(&mut std::io::stderr(), &result.stderr);
        }
    }

    // Store build logs
    let stdout_blob = if !result.stdout.is_empty() {
        let h = store.write_blob(&result.stdout)?;
        Some(h)
    } else {
        None
    };
    let stderr_blob = if !result.stderr.is_empty() {
        let h = store.write_blob(&result.stderr)?;
        Some(h)
    } else {
        None
    };
    store.store_build_log(
        &recipe_hash,
        stdout_blob.as_ref(),
        stderr_blob.as_ref(),
        result.exit_code,
    )?;

    if result.exit_code != 0 {
        // Clean up sandbox dir unless --keep-failed
        if !result.sandbox_preserved {
            crate::sandbox::cleanup_sandbox(&sandbox_root);
        } else {
            eprintln!(
                "[hod] sandbox preserved at {} (keep-failed)",
                sandbox_root.display(),
            );
        }

        return Err(BuildError::ProcessFailed {
            recipe_hash,
            exit_code: result.exit_code,
            stdout: result.stdout,
            stderr: result.stderr,
        });
    }

    // Capture what was written to $OUT
    // The out dir is on the host at sandbox_root/out
    let host_out = sandbox_root.join("out");
    let artifact = if host_out.exists() {
        capture_output(&host_out, store)?
    } else {
        return Err(BuildError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "process did not write any output to $OUT",
        )));
    };

    // Clean up sandbox dir
    crate::sandbox::cleanup_sandbox(&sandbox_root);

    Ok(artifact)
}

// ---------------------------------------------------------------------------
// Artifact materialization and hashing
// ---------------------------------------------------------------------------

/// Materialize an artifact to a path on disk.
///
/// For a File artifact, the path should be the target file path.
/// For a Directory artifact, the path is the target directory.
/// For a Symlink artifact, creates a symlink at the path.
///
/// When materializing into a dep mount (a directory), if the artifact is
/// a single file, we create the parent directory and place the file inside it.
///
/// If the artifact hasn't been staged yet (pure recipes like File/Directory/Symlink
/// don't automatically stage their outputs), it will be staged on demand.
pub fn materialize_artifact(store: &Store, output_hash: &Hash, path: &Path) -> Result<()> {
    let staging_path = artifact_staging_path(store, output_hash);

    if !staging_path.exists() {
        return Err(BuildError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("staged output {} not found", hash_to_hex(output_hash)),
        )));
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    if staging_path.is_dir() {
        copy_dir_recursive(&staging_path, path)?;
    } else if staging_path.is_file() || staging_path.is_symlink() {
        // File/symlink artifact — copy directly to the target path
        if path.exists() {
            if path.is_dir() {
                std::fs::remove_dir_all(path)?;
            } else {
                std::fs::remove_file(path)?;
            }
        }
        std::fs::copy(&staging_path, path)?;
    }
    Ok(())
}

/// Copy a directory recursively.
fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    if dst.exists() {
        std::fs::remove_dir_all(dst)?;
    }
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else if src_path.is_symlink() {
            let target = std::fs::read_link(&src_path)?;
            std::os::unix::fs::symlink(&target, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

/// Capture the output written to `$OUT` and convert it to an artifact.
///
/// Reads the output directory/file and creates an Artifact, storing any new
/// blobs as needed.
fn capture_output(out_dir: &Path, store: &Store) -> Result<Artifact> {
    if !out_dir.exists() {
        return Err(BuildError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "process did not write any output to $OUT",
        )));
    }

    let artifact = path_to_artifact(out_dir, store)?;
    let output_hash = artifact_to_hash(&artifact);

    // Store the materialized output in staging
    let staging_path = artifact_staging_path(store, &output_hash);
    if !staging_path.exists() {
        if let Some(parent) = staging_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        if out_dir.is_file() || out_dir.is_symlink() {
            std::fs::copy(out_dir, &staging_path)?;
        } else if out_dir.is_dir() {
            copy_dir_recursive(out_dir, &staging_path)?;
        }
    }

    // Set executable bit if needed
    if let Artifact::File { executable, .. } = &artifact {
        if *executable {
            use std::os::unix::fs::PermissionsExt;
            let perms = std::fs::Permissions::from_mode(0o755);
            std::fs::set_permissions(&staging_path, perms)?;
        }
    }

    Ok(artifact)
}

/// Convert a filesystem path to an Artifact, storing blobs as needed.
fn path_to_artifact(path: &Path, store: &Store) -> Result<Artifact> {
    if path.is_symlink() {
        let target = std::fs::read_link(path)?
            .to_string_lossy()
            .to_string();
        Ok(Artifact::Symlink { target })
    } else if path.is_file() {
        let data = std::fs::read(path)?;
        let content_hash = store.write_blob(&data)?;
        let executable = is_executable(path);
        Ok(Artifact::File {
            content_hash,
            executable,
        })
    } else if path.is_dir() {
        let mut entries: Vec<(String, Hash)> = Vec::new();
        for entry in std::fs::read_dir(path)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().to_string();
            let child_artifact = path_to_artifact(&entry.path(), store)?;
            let child_hash = artifact_to_hash(&child_artifact);
            entries.push((name, child_hash));
        }
        entries.sort_by(|a, b| a.0.cmp(&b.0));
        Ok(Artifact::Directory { entries })
    } else {
        Err(BuildError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("unexpected file type at {}", path.display()),
        )))
    }
}

/// Check if a file has the executable bit set.
#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path)
        .map(|m| m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(_path: &Path) -> bool {
    false
}

/// Compute the content hash of an artifact.
///
/// The hash is computed from a canonical binary encoding of the artifact:
/// - File: blake3 of the content blob hash + executable bit
/// - Directory: blake3 of sorted (name_len, name, entry_hash) pairs
/// - Symlink: blake3 of the target string
pub fn artifact_to_hash(artifact: &Artifact) -> Hash {
    match artifact {
        Artifact::File {
            content_hash,
            executable,
        } => {
            let mut data = Vec::with_capacity(32 + 1);
            data.extend_from_slice(content_hash);
            data.push(if *executable { 0x01 } else { 0x00 });
            hash_bytes(&data)
        }
        Artifact::Directory { entries } => {
            let mut data = Vec::new();
            for (name, entry_hash) in entries {
                let name_bytes = name.as_bytes();
                data.extend_from_slice(&(name_bytes.len() as u16).to_le_bytes());
                data.extend_from_slice(name_bytes);
                data.extend_from_slice(entry_hash);
            }
            hash_bytes(&data)
        }
        Artifact::Symlink { target } => {
            let target_bytes = target.as_bytes();
            let mut data = Vec::with_capacity(2 + target_bytes.len());
            data.extend_from_slice(&(target_bytes.len() as u16).to_le_bytes());
            data.extend_from_slice(target_bytes);
            hash_bytes(&data)
        }
    }
}

/// Path to a materialized artifact in the staging directory.
pub fn artifact_staging_path(store: &Store, hash: &Hash) -> PathBuf {
    let shard = crate::hash::hash_shard(hash);
    let hex = hash_to_hex(hash);
    store.staging_dir().join(&shard).join(&hex)
}

/// Stage an artifact to disk so it can be materialized later.
///
/// This writes the artifact's content to the staging directory, creating the
/// on-disk representation (file, directory tree, or symlink) that can be
/// copied or bind-mounted for downstream recipes.
fn stage_artifact(store: &Store, artifact: &Artifact, output_hash: &Hash) -> Result<()> {
    let staging_path = artifact_staging_path(store, output_hash);
    if staging_path.exists() {
        return Ok(());
    }

    if let Some(parent) = staging_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    match artifact {
        Artifact::File {
            content_hash,
            executable,
        } => {
            let data = store.read_blob(content_hash)?;
            std::fs::write(&staging_path, &data)?;
            if *executable {
                use std::os::unix::fs::PermissionsExt;
                let perms = std::fs::Permissions::from_mode(0o755);
                std::fs::set_permissions(&staging_path, perms)?;
            }
        }
        Artifact::Directory { entries } => {
            std::fs::create_dir_all(&staging_path)?;
            for (name, entry_hash) in entries {
                // Recursively stage and materialize each entry
                let entry_staging = artifact_staging_path(store, entry_hash);
                // We need to stage the child artifacts too, but we can only
                // do that if they've already been built. Since we stage after
                // building, children should already be staged.
                let entry_path = staging_path.join(name);
                if entry_staging.exists() {
                    if entry_staging.is_dir() {
                        copy_dir_recursive(&entry_staging, &entry_path)?;
                    } else if entry_staging.is_symlink() {
                        let target = std::fs::read_link(&entry_staging)?;
                        std::os::unix::fs::symlink(&target, &entry_path)?;
                    } else {
                        std::fs::copy(&entry_staging, &entry_path)?;
                    }
                }
            }
        }
        Artifact::Symlink { target } => {
            let target_path = PathBuf::from(target);
            std::os::unix::fs::symlink(&target_path, &staging_path)?;
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Detect the current platform string.
pub fn current_platform() -> String {
    let arch = std::env::consts::ARCH;
    let os = std::env::consts::OS;
    format!("{arch}-{os}")
}

/// Format a recipe type for display.
fn format_recipe_type(rt: RecipeType) -> &'static str {
    match rt {
        RecipeType::File => "file",
        RecipeType::Directory => "directory",
        RecipeType::Symlink => "symlink",
        RecipeType::Download => "download",
        RecipeType::Process => "process",
    }
}
