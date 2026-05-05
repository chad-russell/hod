//! Test fixture builder — generates `.hod` binary fixtures programmatically.
//!
//! This module provides helpers to construct recipe binaries and write them
//! to disk as `.hod` files. The fixtures are used by end-to-end integration
//! tests (Layer 7) to test the full pipeline from `hod build` through
//! `hod ls-output`.
//!
//! Rather than hand-writing raw binary bytes (which is error-prone), we use
//! the `Recipe` types from the library and encode them — the resulting bytes
//! *are* the canonical fixture data.

use std::path::{Path, PathBuf};

use hod::build::{self, BuildOptions};
use hod::hash::{hash_bytes, hash_to_hex, Hash};
use hod::recipe::*;
use hod::store::Store;

// ---------------------------------------------------------------------------
// Fixture directory helper
// ---------------------------------------------------------------------------

/// Manages a directory of `.hod` fixture files.
pub struct FixtureDir {
    /// Root directory where fixtures are written.
    dir: PathBuf,
}

impl FixtureDir {
    /// Create a new fixture directory (creates on disk).
    pub fn create(root: &Path) -> std::io::Result<Self> {
        std::fs::create_dir_all(root)?;
        Ok(Self {
            dir: root.to_path_buf(),
        })
    }

    /// Write a recipe as a `.hod` file, returning its path.
    pub fn write_recipe(&self, recipe: &Recipe) -> (PathBuf, Hash) {
        let bytes = recipe.encode();
        let hash = recipe.recipe_hash();
        let hex = hash_to_hex(&hash);
        let path = self.dir.join(format!("{}.hod", &hex[..16]));
        std::fs::write(&path, &bytes).expect("failed to write fixture");
        (path, hash)
    }

    /// Write raw bytes as a `.hod` file.
    #[allow(dead_code)]
    pub fn write_raw(&self, name: &str, bytes: &[u8]) -> PathBuf {
        let path = self.dir.join(format!("{name}.hod"));
        std::fs::write(&path, bytes).expect("failed to write fixture");
        path
    }

    /// The fixture directory path.
    pub fn path(&self) -> &Path {
        &self.dir
    }
}

// ---------------------------------------------------------------------------
// Recipe builders — construct common test recipes
// ---------------------------------------------------------------------------

/// Build a File recipe. Pre-stores the content blob in the store.
/// Returns the recipe and the content hash.
pub fn make_file_recipe(
    store: &Store,
    content: &[u8],
    executable: bool,
) -> Recipe {
    store.write_blob(content).expect("store blob");
    Recipe::File(RecipeFile {
        content_blob_hash: hash_bytes(content),
        executable,
        resources_hash: None,
    })
}

/// Build a Symlink recipe.
pub fn make_symlink_recipe(target: &str) -> Recipe {
    Recipe::Symlink(RecipeSymlink {
        target: target.to_string(),
    })
}

/// Build a Directory recipe with the given named entries.
pub fn make_directory_recipe(entries: Vec<(&str, Hash)>) -> Recipe {
    let mut entries: Vec<DirectoryEntry> = entries
        .into_iter()
        .map(|(name, hash)| DirectoryEntry {
            name: name.to_string(),
            entry_hash: hash,
        })
        .collect();
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Recipe::Directory(RecipeDirectory { entries })
}

/// Build a Process recipe that runs a shell command.
pub fn make_process_recipe(command: &str, deps: Vec<(&str, Hash)>) -> Recipe {
    let mut deps: Vec<ProcessDependency> = deps
        .into_iter()
        .map(|(name, hash)| ProcessDependency {
            name: name.to_string(),
            recipe_hash: hash,
        })
        .collect();
    deps.sort_by(|a, b| a.name.cmp(&b.name));

    Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: "/bin/bash".to_string(),
        args: vec!["-c".to_string(), command.to_string()],
        env: vec![],
        dependencies: deps,
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    })
}

/// Build a Process recipe with custom env vars.
pub fn make_process_with_env(
    command: &str,
    env: Vec<(&str, &str)>,
    deps: Vec<(&str, Hash)>,
) -> Recipe {
    let mut deps: Vec<ProcessDependency> = deps
        .into_iter()
        .map(|(name, hash)| ProcessDependency {
            name: name.to_string(),
            recipe_hash: hash,
        })
        .collect();
    deps.sort_by(|a, b| a.name.cmp(&b.name));

    let mut env: Vec<EnvVar> = env
        .into_iter()
        .map(|(key, value)| EnvVar {
            key: key.to_string(),
            value: value.to_string(),
        })
        .collect();
    env.sort_by(|a, b| a.key.cmp(&b.key));

    Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: "/bin/bash".to_string(),
        args: vec!["-c".to_string(), command.to_string()],
        env,
        dependencies: deps,
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    })
}

// ---------------------------------------------------------------------------
// Full fixture setup — common test scenarios
// ---------------------------------------------------------------------------

/// Set up a "hello world" fixture: a File recipe for a shell script and
/// a Process recipe that uses it.
///
/// Returns (file_recipe, file_recipe_hash, process_recipe, process_recipe_hash, fixture_dir).
pub fn setup_hello_world(
    store: &Store,
    fixture_dir: &FixtureDir,
) -> (Recipe, Hash, Recipe, Hash) {
    // 1. Create a File recipe for a hello-world shell script
    let script_content = b"#!/bin/bash\necho 'Hello from Hod!'\n";
    let file_recipe = make_file_recipe(store, script_content, true);
    let (_file_path, file_hash) = fixture_dir.write_recipe(&file_recipe);

    // Pre-build the file recipe so it's in the store
    let file_bytes = file_recipe.encode();
    build::build(store, &file_bytes, &BuildOptions { quiet: true, ..Default::default() })
        .expect("build file recipe");

    // 2. Create a Process recipe that runs the script
    let process_recipe = make_process_recipe(
        "/bin/bash /deps/hello-script/data > $OUT/hello.txt",
        vec![("hello-script", file_hash)],
    );
    let (_, process_hash) = fixture_dir.write_recipe(&process_recipe);

    (file_recipe, file_hash, process_recipe, process_hash)
}

/// Set up a multi-file directory fixture.
///
/// Creates N file recipes and a directory recipe containing all of them.
/// Returns (directory_recipe, dir_recipe_hash, file_recipes).
pub fn setup_directory_with_files(
    store: &Store,
    fixture_dir: &FixtureDir,
    n: usize,
) -> (Recipe, Hash, Vec<(Recipe, Hash)>) {
    let mut file_recipes = Vec::with_capacity(n);
    let mut dir_entries = Vec::with_capacity(n);

    for i in 0..n {
        let content = format!("file {i} content\n").into_bytes();
        let file_recipe = make_file_recipe(store, &content, false);
        let (_file_path, file_hash) = fixture_dir.write_recipe(&file_recipe);

        // Build the file recipe
        let bytes = file_recipe.encode();
        build::build(store, &bytes, &BuildOptions { quiet: true, ..Default::default() })
            .expect("build file");

        dir_entries.push((format!("file_{:04}.txt", i), file_hash));
        file_recipes.push((file_recipe, file_hash));
    }

    let dir_recipe = make_directory_recipe(
        dir_entries.iter().map(|(n, h)| (n.as_str(), *h)).collect(),
    );
    let (_, dir_hash) = fixture_dir.write_recipe(&dir_recipe);

    (dir_recipe, dir_hash, file_recipes)
}

/// Build a linear chain of recipes: file → dir → process → dir → ...
/// Each step depends on the previous. Returns all recipes and hashes in order.
pub fn setup_chain(
    store: &Store,
    fixture_dir: &FixtureDir,
    depth: usize,
) -> Vec<(Recipe, Hash)> {
    let mut chain = Vec::with_capacity(depth);

    // Start with a file recipe
    let content = b"chain root content\n";
    let file_recipe = make_file_recipe(store, content, false);
    let (_, file_hash) = fixture_dir.write_recipe(&file_recipe);
    build::build(
        store,
        &file_recipe.encode(),
        &BuildOptions { quiet: true, ..Default::default() },
    )
    .expect("build chain root");
    chain.push((file_recipe, file_hash));

    // Add alternating directory and process layers
    for i in 1..depth {
        let prev_hash = chain[i - 1].1;

        if i % 2 == 1 {
            // Directory layer
            let dir_recipe = make_directory_recipe(vec![("prev", prev_hash)]);
            let (_, dir_hash) = fixture_dir.write_recipe(&dir_recipe);
            build::build(
                store,
                &dir_recipe.encode(),
                &BuildOptions { quiet: true, ..Default::default() },
            )
            .expect("build chain dir layer");
            chain.push((dir_recipe, dir_hash));
        } else {
            // Process layer
            let proc_recipe = make_process_recipe(
                "ls $DEPS > $OUT/ls_out.txt",
                vec![("prev", prev_hash)],
            );
            let (_, proc_hash) = fixture_dir.write_recipe(&proc_recipe);
            build::build(
                store,
                &proc_recipe.encode(),
                &BuildOptions { quiet: true, ..Default::default() },
            )
            .expect("build chain process layer");
            chain.push((proc_recipe, proc_hash));
        }
    }

    chain
}
