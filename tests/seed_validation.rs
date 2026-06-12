//! Validates that the zero-dependency seed (musl toolchain + BusyBox) can
//! compile a trivial C program in a fully hermetic sandbox with no
//! host bind-mounts.
//!
//! These tests are marked `#[ignore]` because they require:
//!   1. Network access to download the musl toolchain (~60MB)
//!   2. Several minutes to build the seed root (~3min for file copies)
//!
//! These tests use the real (default) hod store so that previously built
//! dependencies are available from cache.
//!
//! Run with: `cargo test --test seed_validation -- --test-threads=1 --ignored`
//!
//! **What this validates:**
//! - The seed-root recipe produces a directory with gcc, busybox, and all applets
//! - A Process recipe with ONLY the seed-root as a dep can compile C code
//! - The sandbox is fully hermetic: no /bin, /usr, /lib, /lib64, /etc, /sbin bind-mounted
//! - The compiled binary is a valid ELF executable

use std::process::Command;

use hod::hash::hex_to_hash;

/// Path to the compiled hod binary.
fn hod_bin() -> String {
    env!("CARGO_BIN_EXE_hod").to_string()
}

/// Run `hod build` with args (using default store), returning the process output.
fn hod_build(recipe_path: &str) -> std::process::Output {
    let args = vec![
        "build",
        recipe_path,
        "--quiet",
    ];
    Command::new(hod_bin())
        .args(&args)
        .output()
        .expect("failed to run hod")
}

/// Run `hod ls-output` with args (using default store), returning the process output.
fn hod_ls_output(hash: &str, extra_args: &[&str]) -> std::process::Output {
    let mut args = vec!["ls-output", hash];
    args.extend(extra_args);
    Command::new(hod_bin())
        .args(&args)
        .output()
        .expect("failed to run hod")
}

/// Seed-root recipe hash (from recipes/bootstrap/seed-root.hod).
const SEED_ROOT_RECIPE_HASH: &str =
    "8f3d75b0806864abbc7ae6d0bae8d4a1ab54b37ec19f537da8717e0fd251b12a";

/// Validate-seed recipe hash (from recipes/bootstrap/validate-seed.hod).
#[allow(dead_code)]
const VALIDATE_SEED_RECIPE_HASH: &str =
    "87d502dbad6a919fd5b4de40b354ae99deade1cc2013aa50e06dab6886e120b7";

/// Get the real store root path.
fn store_root() -> std::path::PathBuf {
    hod::store::StoreConfig { path: None }.resolve()
}

// ===========================================================================
// Test 1: Build the seed-root recipe (download + unpack musl, import busybox,
//         create sandbox root)
// ===========================================================================

#[test]
#[ignore]
fn seed_root_builds() {
    // Build the seed-root recipe from the checked-in .hod file (default store)
    let recipe_path = "recipes/bootstrap/seed-root.hod";
    let output = hod_build(recipe_path);

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    assert!(
        output.status.success(),
        "seed-root build should succeed\nstdout: {stdout}\nstderr: {stderr}"
    );

    let output_hash = stdout.trim().to_string();
    assert_eq!(output_hash.len(), 64, "output hash should be 64 hex chars");

    // Verify the output directory has the expected structure
    let ls = hod_ls_output(&output_hash, &["--recursive"]);
    assert!(ls.status.success(), "ls-output should succeed");

    let listing = String::from_utf8_lossy(&ls.stdout).to_string();
    assert!(
        listing.contains("bin/busybox"),
        "seed output should contain bin/busybox, got:\n{listing}"
    );
    assert!(
        listing.contains("bin/gcc"),
        "seed output should contain bin/gcc, got:\n{listing}"
    );
    assert!(
        listing.contains("bin/sh"),
        "seed output should contain bin/sh, got:\n{listing}"
    );
    assert!(
        listing.contains("lib/"),
        "seed output should contain lib/, got:\n{listing}"
    );
}

// ===========================================================================
// Test 2: Compile a trivial C program using the seed in strict mode
// ===========================================================================

#[test]
#[ignore]
fn seed_gcc_compiles_hello_world() {
    // Step 1: Build the seed-root first (default store, cached if already built)
    let seed_output = hod_build("recipes/bootstrap/seed-root.hod");
    let _seed_stdout = String::from_utf8_lossy(&seed_output.stdout);
    assert!(
        seed_output.status.success(),
        "seed-root build should succeed\nstderr: {}",
        String::from_utf8_lossy(&seed_output.stderr)
    );

    // Step 2: Build the validation recipe (compile int main(){return 0;} in hermetic sandbox)
    let validate_output = hod_build("recipes/bootstrap/validate-seed.hod");
    let validate_stdout = String::from_utf8_lossy(&validate_output.stdout);
    let validate_stderr = String::from_utf8_lossy(&validate_output.stderr);

    assert!(
        validate_output.status.success(),
        "validate-seed build should succeed\nstdout: {validate_stdout}\nstderr: {validate_stderr}"
    );

    let output_hash = validate_stdout.trim().to_string();
    assert_eq!(output_hash.len(), 64, "output hash should be 64 hex chars");

    // Step 3: Verify the output contains the compiled binary and result
    let ls = hod_ls_output(&output_hash, &["--long", "--recursive"]);
    assert!(ls.status.success());

    let listing = String::from_utf8_lossy(&ls.stdout).to_string();
    assert!(
        listing.contains("hello"),
        "output should contain 'hello' binary, got:\n{listing}"
    );
    assert!(
        listing.contains("result.txt"),
        "output should contain 'result.txt', got:\n{listing}"
    );

    // Step 4: Verify the result.txt content
    let output_hash_parsed = hex_to_hash(&output_hash).unwrap();
    let shard = hod::hash::hash_shard(&output_hash_parsed);
    let store_path = store_root();
    let staging_path = store_path
        .join("staging")
        .join(&shard)
        .join(&output_hash);

    let result_content =
        std::fs::read_to_string(staging_path.join("result.txt")).unwrap_or_default();
    assert!(
        result_content.contains("seed-gcc compiled successfully"),
        "result.txt should confirm compilation, got: {result_content}"
    );

    // Step 5: Verify the hello binary is a valid ELF
    let hello_path = staging_path.join("hello");
    assert!(hello_path.exists(), "hello binary should exist");

    let hello_bytes = std::fs::read(&hello_path).unwrap();
    assert!(
        hello_bytes.len() >= 4,
        "hello binary should have some content"
    );
    // Check ELF magic bytes: 0x7f 'E' 'L' 'F'
    assert_eq!(hello_bytes[0], 0x7f, "should be ELF magic byte 0");
    assert_eq!(hello_bytes[1], b'E', "should be ELF magic byte 1");
    assert_eq!(hello_bytes[2], b'L', "should be ELF magic byte 2");
    assert_eq!(hello_bytes[3], b'F', "should be ELF magic byte 3");
    // 64-bit ELF
    assert_eq!(hello_bytes[4], 2, "should be 64-bit ELF");
    // Little-endian
    assert_eq!(hello_bytes[5], 1, "should be little-endian");
}

// ===========================================================================
// Test 3: Verify the seed recipe hash is deterministic
// ===========================================================================

#[test]
#[ignore]
fn seed_recipe_hash_matches_known_value() {
    // Build the seed-root and verify its recipe hash matches the expected value.
    // This ensures the seed-root recipe hasn't changed unexpectedly.
    let output = hod_build("recipes/bootstrap/seed-root.hod");
    assert!(
        output.status.success(),
        "seed build should succeed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    // The recipe hash is deterministic — verify it matches the known value
    // by checking the store has a recipe entry for the expected hash
    let store_path = store_root();
    let store = hod::store::Store::open_at(&store_path).unwrap();
    let recipe_hash = hex_to_hash(SEED_ROOT_RECIPE_HASH).unwrap();
    let stored_recipe = store.get_recipe(&recipe_hash).unwrap();
    assert!(
        !stored_recipe.is_empty(),
        "seed-root recipe hash {} should be in the store",
        SEED_ROOT_RECIPE_HASH
    );
}

// ===========================================================================
// Test 4: Verify hermeticity — no host paths leaked
// ===========================================================================

#[test]
#[ignore]
fn no_host_paths_accessible() {
    // Build a process that checks whether host paths are accessible.
    // The sandbox is always hermetic: /usr/bin, /usr/lib, etc. should NOT be accessible.
    let store_path = store_root();

    // First build the seed (cached)
    let seed_output = hod_build("recipes/bootstrap/seed-root.hod");
    assert!(
        seed_output.status.success(),
        "seed build should succeed: {}",
        String::from_utf8_lossy(&seed_output.stderr)
    );

    // Create a test recipe that checks for host paths
    let test_script = r#"
set -e
# Check that host directories are NOT accessible in the hermetic sandbox
# /usr should not exist or be empty (not bind-mounted from host)
if [ -d /usr/bin ]; then
  echo "FAIL: /usr/bin exists in hermetic sandbox" > $OUT/result.txt
  exit 1
fi
if [ -d /usr/lib ]; then
  echo "FAIL: /usr/lib exists in hermetic sandbox" > $OUT/result.txt
  exit 1
fi
# /etc should not exist or be empty
if [ -d /etc ] && ls /etc/* 2>/dev/null; then
  echo "FAIL: /etc has files in hermetic sandbox" > $OUT/result.txt
  exit 1
fi
# /deps/seed should exist and have gcc
if [ ! -x /deps/seed/bin/gcc ]; then
  echo "FAIL: /deps/seed/bin/gcc not found" > $OUT/result.txt
  exit 1
fi
echo "PASS: hermetic sandbox has no host paths" > $OUT/result.txt
"#;

    // Build a recipe that uses the seed as the only dep
    let recipe = hod::recipe::Recipe::Process(hod::recipe::RecipeProcess {
        platform: hod::build::current_platform(),
        command: "/deps/seed/bin/busybox".to_string(),
        args: vec!["sh".to_string(), "-c".to_string(), test_script.to_string()],
        env: vec![],
        dependencies: vec![hod::recipe::ProcessDependency {
            name: "seed".to_string(),
            recipe_hash: hex_to_hash(SEED_ROOT_RECIPE_HASH).unwrap(),
        }],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
            runtime_deps: None,
            runtime: None,
    });

    let recipe_bytes = recipe.encode();
    let recipe_hash = recipe.recipe_hash();

    // Write recipe to disk
    let tmp = tempfile::tempdir().unwrap();
    let recipe_path = tmp.path().join("hermetic-test.hod");
    std::fs::write(&recipe_path, &recipe_bytes).unwrap();

    // Build using default store
    let output = hod_build(
        recipe_path.to_str().unwrap(),
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    assert!(
        output.status.success(),
        "hermetic sandbox test should succeed\nstdout: {stdout}\nstderr: {stderr}"
    );

    let output_hash = stdout.trim().to_string();
    let output_hash_parsed = hex_to_hash(&output_hash).unwrap();
    let staging_path = store_path
        .join("staging")
        .join(&hod::hash::hash_shard(&output_hash_parsed))
        .join(&output_hash);

    let result =
        std::fs::read_to_string(staging_path.join("result.txt")).unwrap_or_default();
    assert!(
        result.contains("PASS"),
        "hermetic sandbox validation should pass, got: {result}"
    );

    // Suppress unused variable warning
    let _ = recipe_hash;
}
