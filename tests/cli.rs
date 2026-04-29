//! CLI tests — Layer 6.
//!
//! Tests the `hod build` and `hod ls-output` commands by running the actual
//! binary and checking exit codes and output.

use std::process::Command;

use hod::build::{self, BuildOptions};
use hod::hash::{hash_bytes, hash_to_hex};
use hod::recipe::*;
use hod::store::Store;

use tempfile::TempDir;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Path to the built hod binary.
fn hod_bin() -> String {
    env!("CARGO_BIN_EXE_hod").to_string()
}

/// Create a test store in a temp directory.
fn test_store() -> (TempDir, Store) {
    let tmp = TempDir::new().unwrap();
    let store = Store::open_at(tmp.path()).unwrap();
    (tmp, store)
}

/// Write a .hod file to disk and return its path.
fn write_recipe_file(tmp: &TempDir, recipe: &Recipe) -> std::path::PathBuf {
    let bytes = recipe.encode();
    let hash = recipe.recipe_hash();
    let path = tmp.path().join(format!("{}.hod", &hash_to_hex(&hash)[..16]));
    std::fs::write(&path, &bytes).unwrap();
    path
}

/// Run `hod build` with the given arguments.
fn run_build(recipe_path: &std::path::Path, store_path: &std::path::Path) -> std::process::Output {
    run_build_with_args(recipe_path, store_path, &[])
}

/// Run `hod build` with additional arguments.
fn run_build_with_args(
    recipe_path: &std::path::Path,
    store_path: &std::path::Path,
    extra_args: &[&str],
) -> std::process::Output {
    let mut args = vec![
        "build",
        recipe_path.to_str().unwrap(),
        "--store",
        store_path.to_str().unwrap(),
        "--quiet",
    ];
    args.extend(extra_args);
    Command::new(hod_bin())
        .args(&args)
        .output()
        .expect("failed to run hod")
}

/// Run `hod ls-output` with the given arguments.
fn run_ls_output(hash: &str, store_path: &std::path::Path) -> std::process::Output {
    run_ls_output_with_args(hash, store_path, &[])
}

/// Run `hod ls-output` with additional arguments.
fn run_ls_output_with_args(
    hash: &str,
    store_path: &std::path::Path,
    extra_args: &[&str],
) -> std::process::Output {
    let mut args = vec![
        "ls-output",
        hash,
        "--store",
        store_path.to_str().unwrap(),
    ];
    args.extend(extra_args);
    Command::new(hod_bin())
        .args(&args)
        .output()
        .expect("failed to run hod")
}

/// Create a File recipe and pre-populate the store with its blob.
fn setup_file_recipe(store: &Store, content: &[u8], executable: bool) -> Recipe {
    store.write_blob(content).unwrap();
    Recipe::File(RecipeFile {
        content_blob_hash: hash_bytes(content),
        executable,
        resources_hash: None,
    })
}

// ---------------------------------------------------------------------------
// 6.4 Tests: `hod build`
// ---------------------------------------------------------------------------

#[test]
fn build_valid_file_recipe_prints_hash_exit_0() {
    let (tmp, store) = test_store();
    let content = b"hello from hod cli test!\n";

    let recipe = setup_file_recipe(&store, content, false);
    let recipe_path = write_recipe_file(&tmp, &recipe);

    let output = run_build(&recipe_path, store.root());

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    assert!(output.status.success(), "build should succeed, stderr: {stderr}");

    // stdout should contain exactly the output hash (one line, 64 hex chars)
    let hash_line = stdout.trim();
    assert_eq!(hash_line.len(), 64, "output should be 64 hex chars, got: {hash_line}");
    assert!(hash_line.chars().all(|c| c.is_ascii_hexdigit()), "output should be hex: {hash_line}");

    // Verify the hash is valid by looking it up in the store
    let recipe_hash = recipe.recipe_hash();
    let stored_output = store.get_output(&recipe_hash).unwrap().unwrap();
    assert_eq!(hash_to_hex(&stored_output), hash_line);
}

#[test]
fn build_invalid_file_exit_3() {
    let (tmp, store) = test_store();

    // Write garbage data as a .hod file
    let bad_path = tmp.path().join("bad.hod");
    std::fs::write(&bad_path, b"this is not a valid recipe").unwrap();

    let output = run_build(&bad_path, store.root());

    assert_eq!(output.status.code(), Some(3), "invalid recipe should exit 3");
}

#[test]
fn build_nonexistent_file_exit_3() {
    let (tmp, store) = test_store();

    let output = run_build(
        &tmp.path().join("nonexistent.hod"),
        store.root(),
    );

    assert_eq!(output.status.code(), Some(3), "missing file should exit 3");
}

#[test]
fn build_missing_dependency_exit_4() {
    let (tmp, store) = test_store();

    // Create a directory recipe that references a nonexistent dependency
    let fake_hash = hash_bytes(b"nonexistent recipe hash");
    let dir_recipe = Recipe::Directory(RecipeDirectory {
        entries: vec![DirectoryEntry {
            name: "missing".to_string(),
            entry_hash: fake_hash,
        }],
    });

    let recipe_path = write_recipe_file(&tmp, &dir_recipe);
    let output = run_build(&recipe_path, store.root());

    assert_eq!(output.status.code(), Some(4), "missing dependency should exit 4");
}

#[test]
fn build_symlink_recipe() {
    let (tmp, store) = test_store();

    let recipe = Recipe::Symlink(RecipeSymlink {
        target: "../other/file.txt".to_string(),
    });
    let recipe_path = write_recipe_file(&tmp, &recipe);

    let output = run_build(&recipe_path, store.root());

    assert!(output.status.success(), "symlink build should succeed");
    let hash_line = String::from_utf8_lossy(&output.stdout).trim().to_string();
    assert_eq!(hash_line.len(), 64);
}

#[test]
fn build_directory_with_entries() {
    let (tmp, store) = test_store();

    let content = b"file content for dir test\n";
    let file_recipe = setup_file_recipe(&store, content, false);

    // Pre-build the file recipe so the directory can find it
    let file_bytes = file_recipe.encode();
    build::build(&store, &file_bytes, &BuildOptions { quiet: true, ..Default::default() }).unwrap();

    let dir_recipe = Recipe::Directory(RecipeDirectory {
        entries: vec![DirectoryEntry {
            name: "data.txt".to_string(),
            entry_hash: file_recipe.recipe_hash(),
        }],
    });

    let recipe_path = write_recipe_file(&tmp, &dir_recipe);
    let output = run_build(&recipe_path, store.root());

    assert!(output.status.success(), "directory build should succeed, stderr: {}",
        String::from_utf8_lossy(&output.stderr));
}

#[test]
fn build_force_flag() {
    let (tmp, store) = test_store();
    let content = b"force rebuild test\n";
    let recipe = setup_file_recipe(&store, content, false);
    let recipe_path = write_recipe_file(&tmp, &recipe);

    // Build once normally
    let output1 = run_build(&recipe_path, store.root());
    assert!(output1.status.success());
    let hash1 = String::from_utf8_lossy(&output1.stdout).trim().to_string();

    // Build again with --force — same hash
    let output2 = run_build_with_args(&recipe_path, store.root(), &["--force"]);
    assert!(output2.status.success());
    let hash2 = String::from_utf8_lossy(&output2.stdout).trim().to_string();

    assert_eq!(hash1, hash2, "forced rebuild should produce same hash");
}

#[test]
fn build_store_flag_overrides_location() {
    let (tmp1, store1) = test_store();
    let (_tmp2, store2) = test_store();

    let content = b"store override test\n";
    let recipe = setup_file_recipe(&store2, content, false);
    let recipe_path = write_recipe_file(&tmp1, &recipe);

    // Build using store2
    let output = run_build(&recipe_path, store2.root());
    assert!(output.status.success());

    // Build using store1 (blob not there) — should fail
    let output = run_build(&recipe_path, store1.root());
    assert!(!output.status.success(), "should fail with wrong store");
}

// ---------------------------------------------------------------------------
// 6.4 Tests: `hod ls-output`
// ---------------------------------------------------------------------------

#[test]
fn ls_output_known_hash() {
    let (tmp, store) = test_store();
    let content = b"ls-output test content\n";
    let recipe = setup_file_recipe(&store, content, false);

    // Build the recipe to get the output hash
    let recipe_path = write_recipe_file(&tmp, &recipe);
    let build_output = run_build(&recipe_path, store.root());
    assert!(build_output.status.success());

    let output_hash = String::from_utf8_lossy(&build_output.stdout).trim().to_string();

    // List the output
    let ls_output = run_ls_output(&output_hash, store.root());
    assert!(
        ls_output.status.success(),
        "ls-output should succeed, stderr: {}",
        String::from_utf8_lossy(&ls_output.stderr),
    );

    let listing = String::from_utf8_lossy(&ls_output.stdout).to_string();
    // For a single file output, we should see it listed
    assert!(!listing.trim().is_empty(), "listing should not be empty");
}

#[test]
fn ls_output_unknown_hash() {
    let (_tmp, store) = test_store();

    let fake_hash = hash_to_hex(&hash_bytes(b"nonexistent output"));

    let output = run_ls_output(&fake_hash, store.root());
    assert_eq!(output.status.code(), Some(4), "unknown output should exit 4");
}

#[test]
fn ls_output_invalid_hash() {
    let (_tmp, store) = test_store();

    let output = run_ls_output("not-a-hash", store.root());
    assert_eq!(output.status.code(), Some(3), "invalid hash should exit 3");
}

#[test]
fn ls_output_long_flag() {
    let (tmp, store) = test_store();
    let content = b"long listing test\n";
    let recipe = setup_file_recipe(&store, content, false);

    let recipe_path = write_recipe_file(&tmp, &recipe);
    let build_output = run_build(&recipe_path, store.root());
    let output_hash = String::from_utf8_lossy(&build_output.stdout).trim().to_string();

    let ls_output = run_ls_output_with_args(&output_hash, store.root(), &["--long"]);
    assert!(ls_output.status.success());

    let listing = String::from_utf8_lossy(&ls_output.stdout).to_string();
    // Long listing should include permissions and size
    // Format: "perms  size  name"
    assert!(
        listing.contains("-rw-") || listing.contains("-r--") || listing.contains("-rwx"),
        "long listing should show permissions, got: {listing}"
    );
}

#[test]
fn ls_output_directory_listing() {
    let (tmp, store) = test_store();

    // Create a directory with two files
    let content_a = b"file A\n";
    let content_b = b"file B\n";
    let file_a = setup_file_recipe(&store, content_a, false);
    let file_b = setup_file_recipe(&store, content_b, true);

    // Build both files
    let bytes_a = file_a.encode();
    let bytes_b = file_b.encode();
    build::build(&store, &bytes_a, &BuildOptions { quiet: true, ..Default::default() }).unwrap();
    build::build(&store, &bytes_b, &BuildOptions { quiet: true, ..Default::default() }).unwrap();

    let dir_recipe = Recipe::Directory(RecipeDirectory {
        entries: vec![
            DirectoryEntry {
                name: "alpha.txt".to_string(),
                entry_hash: file_a.recipe_hash(),
            },
            DirectoryEntry {
                name: "beta.sh".to_string(),
                entry_hash: file_b.recipe_hash(),
            },
        ],
    });

    let dir_path = write_recipe_file(&tmp, &dir_recipe);
    let build_output = run_build(&dir_path, store.root());
    assert!(
        build_output.status.success(),
        "directory build should succeed, stderr: {}",
        String::from_utf8_lossy(&build_output.stderr),
    );

    let output_hash = String::from_utf8_lossy(&build_output.stdout).trim().to_string();

    // List the output (non-recursive)
    let ls_output = run_ls_output(&output_hash, store.root());
    assert!(ls_output.status.success());

    let listing = String::from_utf8_lossy(&ls_output.stdout).to_string();
    assert!(listing.contains("alpha.txt"), "listing should contain alpha.txt, got: {listing}");
    assert!(listing.contains("beta.sh"), "listing should contain beta.sh, got: {listing}");
}

// ---------------------------------------------------------------------------
// 6.4 Tests: Exit codes
// ---------------------------------------------------------------------------

#[test]
fn exit_code_0_success() {
    let (tmp, store) = test_store();
    let content = b"success test\n";
    let recipe = setup_file_recipe(&store, content, false);
    let recipe_path = write_recipe_file(&tmp, &recipe);

    let output = run_build(&recipe_path, store.root());
    assert_eq!(output.status.code(), Some(0));
}

#[test]
fn exit_code_3_invalid_recipe() {
    let (tmp, store) = test_store();
    let bad_path = tmp.path().join("garbage.hod");
    std::fs::write(&bad_path, b"not a recipe").unwrap();

    let output = run_build(&bad_path, store.root());
    assert_eq!(output.status.code(), Some(3));
}

#[test]
fn exit_code_4_missing_dependency() {
    let (tmp, store) = test_store();
    let fake_hash = hash_bytes(b"no such recipe");
    let dir_recipe = Recipe::Directory(RecipeDirectory {
        entries: vec![DirectoryEntry {
            name: "missing".to_string(),
            entry_hash: fake_hash,
        }],
    });

    let recipe_path = write_recipe_file(&tmp, &dir_recipe);
    let output = run_build(&recipe_path, store.root());
    assert_eq!(output.status.code(), Some(4));
}
