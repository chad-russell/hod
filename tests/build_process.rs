//! Build process tests — Layer 3.
//!
//! Tests the build orchestrator with pure recipes (File, Directory, Symlink),
//! caching, and dependency resolution.
//!
//! Process-spawning tests are marked `#[ignore]` because the sandbox is fully
//! hermetic — no host filesystem is available inside. These tests use the real
//! hod store so that the seed-root (busybox) dependency is already cached.
//! Run with: `cargo test --test build_process -- --test-threads=1 --ignored`

use hod::build::{self, Artifact, BuildError, BuildOptions};
use hod::hash::{hash_bytes, hash_to_hex, hex_to_hash, Hash};
use hod::recipe::*;
use hod::store::{Store, StoreConfig};

use tempfile::TempDir;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Create a test store in a temp directory.
fn test_store() -> (TempDir, Store) {
    let tmp = TempDir::new().unwrap();
    let store = Store::open_at(tmp.path()).unwrap();
    (tmp, store)
}

/// Open the real (default) hod store. Used by integration tests that need
/// pre-built dependencies like seed-root.
fn real_store() -> Store {
    Store::open(&StoreConfig { path: None }).unwrap()
}

/// Recipe hash for seed-root — provides busybox and the musl toolchain.
/// Already built and cached in the real store.
const SEED_ROOT_RECIPE_HASH: &str =
    "8f3d75b0806864abbc7ae6d0bae8d4a1ab54b37ec19f537da8717e0fd251b12a";

/// Create a seed-root ProcessDependency for use in sandboxed recipes.
/// The seed-root output provides /deps/seed/bin/busybox (and sh, etc.).
fn seed_dep() -> ProcessDependency {
    ProcessDependency {
        name: "seed".to_string(),
        recipe_hash: hex_to_hash(SEED_ROOT_RECIPE_HASH).unwrap(),
    }
}

/// Command to invoke busybox ash inside the sandbox.
/// Requires seed-root as a dependency named "seed".
const SANDBOX_SHELL: &str = "/deps/seed/bin/busybox";

/// Default build options.
fn default_opts() -> BuildOptions {
    BuildOptions::default()
}

/// Force-rebuild options.
fn force_opts() -> BuildOptions {
    BuildOptions {
        force: true,
        force_recursive: false,
        quiet: true,
        keep_failed: false,
    }
}

/// Build a recipe from its Recipe struct. Stores the recipe first, then builds.
fn build_recipe(store: &Store, recipe: &Recipe, opts: &BuildOptions) -> std::result::Result<Hash, BuildError> {
    let bytes = recipe.encode();
    build::build(store, &bytes, opts)
}

/// Store a blob and return its hash.
fn store_blob(store: &Store, data: &[u8]) -> Hash {
    store.write_blob(data).unwrap()
}

/// Create a File recipe with the given content.
fn make_file_recipe(content: &[u8], executable: bool) -> Recipe {
    let content_hash = hash_bytes(content);
    Recipe::File(RecipeFile {
        content_blob_hash: content_hash,
        executable,
        resources_hash: None,
    })
}

/// Create a Symlink recipe.
fn make_symlink_recipe(target: &str) -> Recipe {
    Recipe::Symlink(RecipeSymlink {
        target: target.to_string(),
    })
}

/// Create a Directory recipe with the given entries.
fn make_directory_recipe(entries: Vec<(&str, Hash)>) -> Recipe {
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

// ---------------------------------------------------------------------------
// 3.5 Tests: Pure recipes
// ---------------------------------------------------------------------------

#[test]
fn build_file_recipe_blob_stored_output_hash_correct() {
    let (_tmp, store) = test_store();
    let content = b"hello, hod!";
    let content_hash = hash_bytes(content);

    // Pre-store the blob
    store_blob(&store, content);

    let recipe = make_file_recipe(content, false);
    let output_hash = build_recipe(&store, &recipe, &default_opts()).unwrap();

    // Output hash should be deterministic
    let expected_artifact = Artifact::File {
        content_hash,
        executable: false,
    };
    let expected_hash = build::artifact_to_hash(&expected_artifact);
    assert_eq!(output_hash, expected_hash);

    // Output should be recorded in the store
    let recipe_hash = recipe.recipe_hash();
    let stored_output = store.get_output(&recipe_hash).unwrap().unwrap();
    assert_eq!(stored_output, output_hash);
}

#[test]
fn build_file_recipe_executable() {
    let (_tmp, store) = test_store();
    let content = b"#!/bin/bash\necho hello";
    store_blob(&store, content);

    let recipe = make_file_recipe(content, true);
    let output_hash = build_recipe(&store, &recipe, &default_opts()).unwrap();

    let expected_artifact = Artifact::File {
        content_hash: hash_bytes(content),
        executable: true,
    };
    let expected_hash = build::artifact_to_hash(&expected_artifact);
    assert_eq!(output_hash, expected_hash);
}

#[test]
fn build_file_recipe_blob_not_found() {
    let (_tmp, store) = test_store();
    let content = b"missing blob";
    // Intentionally do NOT store the blob

    let recipe = make_file_recipe(content, false);
    let result = build_recipe(&store, &recipe, &default_opts());
    assert!(result.is_err());
    match result.unwrap_err() {
        BuildError::Io(_) => {} // expected
        other => panic!("expected IO error, got: {other:?}"),
    }
}

#[test]
fn build_symlink_recipe_correct_target() {
    let (_tmp, store) = test_store();
    let recipe = make_symlink_recipe("../other/file.txt");
    let output_hash = build_recipe(&store, &recipe, &default_opts()).unwrap();

    let expected_artifact = Artifact::Symlink {
        target: "../other/file.txt".to_string(),
    };
    let expected_hash = build::artifact_to_hash(&expected_artifact);
    assert_eq!(output_hash, expected_hash);
}

#[test]
fn build_directory_with_nested_entries() {
    let (_tmp, store) = test_store();

    // Build two file recipes first
    let content_a = b"file A content";
    let content_b = b"file B content";
    store_blob(&store, content_a);
    store_blob(&store, content_b);

    let recipe_a = make_file_recipe(content_a, false);
    let recipe_b = make_file_recipe(content_b, true);

    // Store the file recipes in the store (so they can be looked up by hash)
    let bytes_a = recipe_a.encode();
    let bytes_b = recipe_b.encode();
    store.store_recipe(&bytes_a).unwrap();
    store.store_recipe(&bytes_b).unwrap();

    // Build the file recipes to verify they work
    let _output_a = build::build(&store, &bytes_a, &default_opts()).unwrap();
    let _output_b = build::build(&store, &bytes_b, &default_opts()).unwrap();

    // Now build a directory containing these files — entries use recipe hashes
    let dir_recipe = make_directory_recipe(vec![
        ("file_a", recipe_a.recipe_hash()),
        ("file_b", recipe_b.recipe_hash()),
    ]);
    let dir_output = build_recipe(&store, &dir_recipe, &default_opts()).unwrap();

    // Verify the output is recorded in the store
    let dir_recipe_hash = dir_recipe.recipe_hash();
    let stored = store.get_output(&dir_recipe_hash).unwrap().unwrap();
    assert_eq!(stored, dir_output);
}

#[test]
fn build_directory_empty() {
    let (_tmp, store) = test_store();
    let recipe = make_directory_recipe(vec![]);
    let output_hash = build_recipe(&store, &recipe, &default_opts()).unwrap();

    let expected_artifact = Artifact::Directory { entries: vec![] };
    let expected_hash = build::artifact_to_hash(&expected_artifact);
    assert_eq!(output_hash, expected_hash);
}

// ---------------------------------------------------------------------------
// 3.5 Tests: Caching
// ---------------------------------------------------------------------------

#[test]
fn cache_hit_same_recipe_twice() {
    let (_tmp, store) = test_store();
    let content = b"cached content";
    store_blob(&store, content);

    let recipe = make_file_recipe(content, false);

    // First build
    let hash1 = build_recipe(&store, &recipe, &default_opts()).unwrap();

    // Second build — should be a cache hit
    let hash2 = build_recipe(&store, &recipe, &default_opts()).unwrap();

    assert_eq!(hash1, hash2);
}

#[test]
fn cache_hit_is_fast() {
    let (_tmp, store) = test_store();
    let content = b"cached content for speed test";
    store_blob(&store, content);

    let recipe = make_file_recipe(content, false);

    // First build (cache miss)
    let _hash1 = build_recipe(&store, &recipe, &default_opts()).unwrap();

    // Second build (cache hit) — should be very fast
    let start = std::time::Instant::now();
    let _hash2 = build_recipe(&store, &recipe, &default_opts()).unwrap();
    let elapsed = start.elapsed();

    assert!(
        elapsed.as_millis() < 5,
        "cache hit took {}ms, expected < 5ms",
        elapsed.as_millis(),
    );
}

#[test]
fn force_rebuild_ignores_cache() {
    let (_tmp, store) = test_store();
    let content = b"force rebuild test";
    store_blob(&store, content);

    let recipe = make_file_recipe(content, false);

    // Build with default options (caches)
    let hash1 = build_recipe(&store, &recipe, &default_opts()).unwrap();

    // Build with force — should get same hash (deterministic) but bypass cache
    let hash2 = build_recipe(&store, &recipe, &force_opts()).unwrap();

    assert_eq!(hash1, hash2);
}

// ---------------------------------------------------------------------------
// 3.5 Tests: Dependency resolution
// ---------------------------------------------------------------------------

#[test]
fn dependency_chain_file_in_directory() {
    let (_tmp, store) = test_store();

    // Create a file recipe
    let content = b"nested file content";
    store_blob(&store, content);
    let file_recipe = make_file_recipe(content, false);
    let file_bytes = file_recipe.encode();
    let _file_hash = store.store_recipe(&file_bytes).unwrap();

    // Build the file recipe
    let _file_output = build::build(&store, &file_bytes, &default_opts()).unwrap();

    // Create a directory recipe referencing the file by RECIPE hash
    let dir_recipe = make_directory_recipe(vec![("data.txt", file_recipe.recipe_hash())]);
    let _dir_output = build_recipe(&store, &dir_recipe, &default_opts()).unwrap();

    // Dependencies should be recorded
    let deps = store.get_dependencies(&dir_recipe.recipe_hash()).unwrap();
    assert!(!deps.is_empty());
}

#[test]
fn missing_dependency_error() {
    let (_tmp, store) = test_store();

    // Create a fake hash that doesn't exist in the store
    let fake_hash = hash_bytes(b"nonexistent recipe");
    let dir_recipe = make_directory_recipe(vec![("missing", fake_hash)]);

    // The recipe bytes for the missing dependency aren't in the store,
    // so building should fail
    let result = build_recipe(&store, &dir_recipe, &default_opts());
    assert!(result.is_err());
    match result.unwrap_err() {
        BuildError::DependencyNotFound { dep_hash, .. } => {
            assert_eq!(dep_hash, fake_hash);
        }
        other => panic!("expected DependencyNotFound, got: {other:?}"),
    }
}

#[test]
fn invalid_recipe_binary_error() {
    let (_tmp, store) = test_store();
    let bad_bytes = b"this is not a valid recipe";

    let result = build::build(&store, bad_bytes, &default_opts());
    assert!(result.is_err());
    match result.unwrap_err() {
        BuildError::InvalidRecipe(_) => {} // expected
        other => panic!("expected InvalidRecipe, got: {other:?}"),
    }
}

// ---------------------------------------------------------------------------
// 3.5 Tests: Determinism
// ---------------------------------------------------------------------------

#[test]
fn build_deterministic_across_stores() {
    let (_tmp1, store1) = test_store();
    let (_tmp2, store2) = test_store();

    let content = b"deterministic content";
    store_blob(&store1, content);
    store_blob(&store2, content);

    let recipe = make_file_recipe(content, false);

    let hash1 = build_recipe(&store1, &recipe, &default_opts()).unwrap();
    let hash2 = build_recipe(&store2, &recipe, &default_opts()).unwrap();

    assert_eq!(hash1, hash2, "same recipe should produce same output hash in different stores");
}

#[test]
fn build_output_hash_deterministic() {
    let (_tmp, store) = test_store();
    let content = b"hash stability test";
    store_blob(&store, content);

    let recipe = make_file_recipe(content, false);

    // Build multiple times with force — should always get the same hash
    let hash1 = build_recipe(&store, &recipe, &force_opts()).unwrap();
    let hash2 = build_recipe(&store, &recipe, &force_opts()).unwrap();
    let hash3 = build_recipe(&store, &recipe, &force_opts()).unwrap();

    assert_eq!(hash1, hash2);
    assert_eq!(hash2, hash3);
}

// ---------------------------------------------------------------------------
// 3.5 Tests: Artifact hashing
// ---------------------------------------------------------------------------

#[test]
fn artifact_hash_file_differs_by_executable_bit() {
    let content_hash = hash_bytes(b"test content");

    let artifact_nonexec = Artifact::File {
        content_hash,
        executable: false,
    };
    let artifact_exec = Artifact::File {
        content_hash,
        executable: true,
    };

    let hash1 = build::artifact_to_hash(&artifact_nonexec);
    let hash2 = build::artifact_to_hash(&artifact_exec);
    assert_ne!(hash1, hash2, "same content but different executable bit should produce different hashes");
}

#[test]
fn artifact_hash_directory_order_matters() {
    let hash_a = hash_bytes(b"file A");
    let hash_b = hash_bytes(b"file B");

    let dir_ab = Artifact::Directory {
        entries: vec![("a".to_string(), hash_a), ("b".to_string(), hash_b)],
    };
    let dir_ba = Artifact::Directory {
        entries: vec![("b".to_string(), hash_b), ("a".to_string(), hash_a)],
    };

    // Different orders → different hashes
    let hash_ab = build::artifact_to_hash(&dir_ab);
    let hash_ba = build::artifact_to_hash(&dir_ba);
    assert_ne!(hash_ab, hash_ba);
}

// ---------------------------------------------------------------------------
// 3.5 Tests: BuildError exit codes
// ---------------------------------------------------------------------------

#[test]
fn build_error_exit_codes() {
    use hod::encoding::EncodeError;
    assert_eq!(BuildError::InvalidRecipe(EncodeError::UnexpectedEof { what: "test".into() }).exit_code(), 3);
    assert_eq!(BuildError::DependencyNotFound { recipe_hash: [0u8; 32], dep_hash: [0u8; 32] }.exit_code(), 4);
    assert_eq!(BuildError::ProcessFailed { recipe_hash: [0u8; 32], exit_code: 1, stdout: vec![], stderr: vec![] }.exit_code(), 1);
    assert_eq!(BuildError::HashMismatch { expected: [0u8; 32], got: [1u8; 32] }.exit_code(), 2);
    assert_eq!(BuildError::PlatformMismatch { expected: "x86_64-linux".into(), actual: "aarch64-macos".into() }.exit_code(), 5);
}

// ---------------------------------------------------------------------------
// 3.5 Tests: Process recipe (basic, no sandbox)
// ---------------------------------------------------------------------------

#[test]
#[ignore]
fn build_process_hello_world() {
    let store = real_store();

    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec!["sh".to_string(), "-c".to_string(), "echo 'hello world' > \"$OUT/hello.txt\"".to_string()],
        env: vec![],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let output = build_recipe(&store, &process_recipe, &BuildOptions { force: false, force_recursive: false, quiet: true, keep_failed: false });
    assert!(output.is_ok(), "process build failed: {:?}", output.err());

    let output_hash = output.unwrap();

    // Verify the output is recorded
    let stored = store.get_output(&process_recipe.recipe_hash()).unwrap().unwrap();
    assert_eq!(stored, output_hash);

    // Verify materialized output contains expected content
    let staging_path = store.staging_dir()
        .join(&hod::hash::hash_shard(&output_hash))
        .join(&hash_to_hex(&output_hash));
    if staging_path.is_dir() {
        let content = std::fs::read_to_string(staging_path.join("hello.txt")).unwrap_or_default();
        assert!(content.contains("hello world"), "output should contain 'hello world', got: {content}");
    }
}

#[test]
fn build_process_platform_mismatch() {
    let (_tmp, store) = test_store();

    let process_recipe = Recipe::Process(RecipeProcess {
        platform: "aarch64-beos".to_string(),
        command: "/bin/echo".to_string(),
        args: vec![],
        env: vec![],
        dependencies: vec![],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let result = build_recipe(&store, &process_recipe, &default_opts());
    assert!(result.is_err());
    match result.unwrap_err() {
        BuildError::PlatformMismatch { expected, actual } => {
            assert_eq!(expected, "aarch64-beos");
            assert_ne!(actual, "aarch64-beos");
        }
        other => panic!("expected PlatformMismatch, got: {other:?}"),
    }
}

#[test]
#[ignore]
fn build_process_exits_nonzero() {
    let store = real_store();

    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec!["sh".to_string(), "-c".to_string(), "exit 42".to_string()],
        env: vec![],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let result = build_recipe(&store, &process_recipe, &BuildOptions { force: false, force_recursive: false, quiet: true, keep_failed: false });
    assert!(result.is_err());
    match result.unwrap_err() {
        BuildError::ProcessFailed { exit_code, .. } => {
            assert_eq!(exit_code, 42);
        }
        other => panic!("expected ProcessFailed, got: {other:?}"),
    }
}

#[test]
#[ignore]
fn build_process_with_env_vars() {
    let store = real_store();

    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec!["sh".to_string(), "-c".to_string(), "echo $MY_VAR > \"$OUT/output.txt\"".to_string()],
        env: vec![EnvVar {
            key: "MY_VAR".to_string(),
            value: "test_value_123".to_string(),
        }],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let output = build_recipe(&store, &process_recipe, &BuildOptions { force: false, force_recursive: false, quiet: true, keep_failed: false });
    assert!(output.is_ok(), "process build failed: {:?}", output.err());

    let output_hash = output.unwrap();
    let staging_path = store.staging_dir()
        .join(&hod::hash::hash_shard(&output_hash))
        .join(&hash_to_hex(&output_hash));
    if staging_path.is_dir() {
        let content = std::fs::read_to_string(staging_path.join("output.txt")).unwrap_or_default();
        assert!(
            content.contains("test_value_123"),
            "output should contain env var value, got: {content}",
        );
    }
}

#[test]
#[ignore]
fn build_process_writes_to_out() {
    let store = real_store();

    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec!["sh".to_string(), "-c".to_string(), "echo 'output content' > \"$OUT/result.txt\"".to_string()],
        env: vec![],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let output = build_recipe(&store, &process_recipe, &BuildOptions { force: false, force_recursive: false, quiet: true, keep_failed: false });
    assert!(output.is_ok(), "process build should succeed: {:?}", output.err());
}

#[test]
#[ignore]
fn build_process_with_dependency() {
    let store = real_store();

    // Create a script file recipe
    let script_content = b"#!/bin/sh\necho 'from dependency'\n";
    store.write_blob(script_content).unwrap();
    let file_recipe = make_file_recipe(script_content, true);
    let file_bytes = file_recipe.encode();
    store.store_recipe(&file_bytes).unwrap();

    // Create a process that depends on the file recipe
    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec!["sh".to_string(), "-c".to_string(), "ls \"$DEPS/myscript/\" > \"$OUT/listing.txt\"".to_string()],
        env: vec![],
        dependencies: vec![
            ProcessDependency {
                name: "myscript".to_string(),
                recipe_hash: file_recipe.recipe_hash(),
            },
            seed_dep(),
        ],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let output = build_recipe(&store, &process_recipe, &BuildOptions { force: false, force_recursive: false, quiet: true, keep_failed: false });
    assert!(output.is_ok(), "process with deps should succeed: {:?}", output.err());
}

// ---------------------------------------------------------------------------
// 3.5 Tests: Download recipe (stub)
// ---------------------------------------------------------------------------

/// Test that a download recipe with a wrong hash fails with HashMismatch.
#[test]
fn build_download_wrong_hash_fails() {
    let (_tmp, store) = test_store();

    let download_recipe = Recipe::Download(RecipeDownload {
        url: "https://example.com".to_string(),
        hash_algorithm: HashAlgorithm::Blake3,
        expected_hash: hash_bytes(b"this is not the content"),
    });

    let result = build_recipe(&store, &download_recipe, &default_opts());
    assert!(result.is_err());
    match result.unwrap_err() {
        BuildError::HashMismatch { .. } => {
            // Expected: the downloaded content doesn't match the expected hash
        }
        BuildError::Io(e) => {
            // Also acceptable: curl failed (e.g. no network in sandbox)
            let msg = e.to_string();
            assert!(
                msg.contains("curl failed") || msg.contains("spawn curl"),
                "unexpected IO error: {msg}"
            );
        }
        other => panic!("expected HashMismatch or IO error, got: {other:?}"),
    }
}

// ---------------------------------------------------------------------------
// 4.2 Tests: Sandbox isolation (Linux-only)
// ---------------------------------------------------------------------------

#[cfg(target_os = "linux")]
#[test]
#[ignore]
fn sandbox_hello_world_writes_to_out() {
    let store = real_store();

    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec![
            "sh".to_string(),
            "-c".to_string(),
            "echo 'hello sandbox' > $OUT/hello.txt".to_string(),
        ],
        env: vec![],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let output_hash = build_recipe(
        &store,
        &process_recipe,
        &BuildOptions { force: false, force_recursive: false, quiet: true, keep_failed: false },
    )
    .unwrap();

    // Verify the output was captured from the sandbox's /out directory
    let staging_path = store
        .staging_dir()
        .join(&hod::hash::hash_shard(&output_hash))
        .join(&hash_to_hex(&output_hash));

    let content = if staging_path.is_dir() {
        std::fs::read_to_string(staging_path.join("hello.txt")).unwrap_or_default()
    } else {
        std::fs::read_to_string(&staging_path).unwrap_or_default()
    };
    assert!(
        content.contains("hello sandbox"),
        "sandbox output should contain 'hello sandbox', got: {content}"
    );
}

#[cfg(target_os = "linux")]
#[test]
#[ignore]
fn sandbox_env_vars_set_correctly() {
    let store = real_store();

    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec![
            "sh".to_string(),
            "-c".to_string(),
            "echo OUT=$OUT DEPS=$DEPS HOME=$HOME > $OUT/env.txt".to_string(),
        ],
        env: vec![],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let output_hash = build_recipe(
        &store,
        &process_recipe,
        &BuildOptions { force: false, force_recursive: false, quiet: true, keep_failed: false },
    )
    .unwrap();

    let staging_path = store
        .staging_dir()
        .join(&hod::hash::hash_shard(&output_hash))
        .join(&hash_to_hex(&output_hash));

    let content = if staging_path.is_dir() {
        std::fs::read_to_string(staging_path.join("env.txt")).unwrap_or_default()
    } else {
        std::fs::read_to_string(&staging_path).unwrap_or_default()
    };
    assert!(
        content.contains("OUT=/out"),
        "OUT should be /out inside sandbox, got: {content}"
    );
    assert!(
        content.contains("DEPS=/deps"),
        "DEPS should be /deps inside sandbox, got: {content}"
    );
    assert!(
        content.contains("HOME=/homeless-shelter"),
        "HOME should be /homeless-shelter inside sandbox, got: {content}"
    );
}

#[cfg(target_os = "linux")]
#[test]
#[ignore]
fn sandbox_user_env_vars_set() {
    let store = real_store();

    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec![
            "sh".to_string(),
            "-c".to_string(),
            "echo $MY_SANDBOX_VAR > $OUT/var.txt".to_string(),
        ],
        env: vec![EnvVar {
            key: "MY_SANDBOX_VAR".to_string(),
            value: "sandbox_value_42".to_string(),
        }],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let output_hash = build_recipe(
        &store,
        &process_recipe,
        &BuildOptions { force: false, force_recursive: false, quiet: true, keep_failed: false },
    )
    .unwrap();

    let staging_path = store
        .staging_dir()
        .join(&hod::hash::hash_shard(&output_hash))
        .join(&hash_to_hex(&output_hash));

    let content = if staging_path.is_dir() {
        std::fs::read_to_string(staging_path.join("var.txt")).unwrap_or_default()
    } else {
        std::fs::read_to_string(&staging_path).unwrap_or_default()
    };
    assert!(
        content.contains("sandbox_value_42"),
        "user env var should be set, got: {content}"
    );
}

#[cfg(target_os = "linux")]
#[test]
#[ignore]
fn sandbox_build_failure_captures_logs() {
    let store = real_store();

    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec![
            "sh".to_string(),
            "-c".to_string(),
            "echo 'failing message' >&2; exit 7".to_string(),
        ],
        env: vec![],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let result = build_recipe(
        &store,
        &process_recipe,
        &BuildOptions { force: false, force_recursive: false, quiet: true, keep_failed: false },
    );
    assert!(result.is_err());
    match result.unwrap_err() {
        BuildError::ProcessFailed {
            exit_code,
            stderr,
            ..
        } => {
            assert_eq!(exit_code, 7);
            let stderr_str = String::from_utf8_lossy(&stderr);
            assert!(
                stderr_str.contains("failing message"),
                "stderr should contain failure message, got: {stderr_str}"
            );
        }
        other => panic!("expected ProcessFailed, got: {other:?}"),
    }
}

#[cfg(target_os = "linux")]
#[test]
#[ignore]
fn sandbox_deps_populated() {
    let store = real_store();

    // Create a file recipe that we'll use as a dependency
    let dep_content = b"dependency file content";
    store.write_blob(dep_content).unwrap();
    let file_recipe = make_file_recipe(dep_content, false);
    let file_bytes = file_recipe.encode();
    store.store_recipe(&file_bytes).unwrap();

    // Build the file recipe first so its output is staged
    let _file_output = build::build(&store, &file_bytes, &default_opts()).unwrap();

    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec![
            "sh".to_string(),
            "-c".to_string(),
            "ls $DEPS > $OUT/ls_deps.txt".to_string(),
        ],
        env: vec![],
        dependencies: vec![
            ProcessDependency {
                name: "mydep".to_string(),
                recipe_hash: file_recipe.recipe_hash(),
            },
            seed_dep(),
        ],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let output_hash = build_recipe(
        &store,
        &process_recipe,
        &BuildOptions { force: false, force_recursive: false, quiet: true, keep_failed: false },
    )
    .unwrap();

    let staging_path = store
        .staging_dir()
        .join(&hod::hash::hash_shard(&output_hash))
        .join(&hash_to_hex(&output_hash));

    let content = if staging_path.is_dir() {
        std::fs::read_to_string(staging_path.join("ls_deps.txt")).unwrap_or_default()
    } else {
        std::fs::read_to_string(&staging_path).unwrap_or_default()
    };
    assert!(
        content.contains("mydep"),
        "deps listing should contain 'mydep', got: {content}"
    );
}
