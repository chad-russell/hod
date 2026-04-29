//! Store CRUD tests — blob, recipe, output, build log, and dependency operations.
//!
//! Each test creates a store in a temp directory and tears it down afterward.

use hod::hash::{hash_bytes, hash_to_hex, Hash};
use hod::recipe::*;
use hod::store::{Store, StoreConfig};
use std::path::PathBuf;
use tempfile::TempDir;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn open_tmp_store() -> (TempDir, Store) {
    let tmp = TempDir::new().expect("create temp dir");
    let store = Store::open_at(tmp.path()).expect("open store");
    (tmp, store)
}

fn test_hash() -> Hash {
    [0xABu8; 32]
}

fn test_hash_b() -> Hash {
    [0xCDu8; 32]
}

fn make_file_recipe() -> Recipe {
    Recipe::File(RecipeFile {
        content_blob_hash: hash_bytes(b"hello world"),
        executable: false,
        resources_hash: None,
    })
}

// ===========================================================================
// Store open / directory structure
// ===========================================================================

#[test]
fn open_creates_directory_structure() {
    let (tmp, _store) = open_tmp_store();
    let root = tmp.path();
    assert!(root.join("hod.db").exists());
    assert!(root.join("blobs").is_dir());
    assert!(root.join("recipes").is_dir());
    assert!(root.join("outputs").is_dir());
    assert!(root.join("staging").is_dir());
    assert!(root.join("tmp").is_dir());
}

#[test]
fn store_config_resolve_uses_path_override() {
    let config = StoreConfig {
        path: Some(PathBuf::from("/tmp/hod-test-custom")),
    };
    assert_eq!(config.resolve(), PathBuf::from("/tmp/hod-test-custom"));
}

#[test]
fn store_config_resolve_uses_env_var() {
    let config = StoreConfig { path: None };
    // We can't easily test env var precedence in a single test, but we can
    // at least verify it returns something reasonable when no overrides are set.
    let resolved = config.resolve();
    // Should end with "hod" (from XDG_DATA_HOME or ~/.local/share/hod)
    assert!(resolved.to_string_lossy().ends_with("hod"));
}

// ===========================================================================
// Blob storage
// ===========================================================================

#[test]
fn blob_write_and_read_roundtrip() {
    let (_tmp, store) = open_tmp_store();
    let data = b"hello, hod blobs!";
    let hash = store.write_blob(data).expect("write blob");
    let read_data = store.read_blob(&hash).expect("read blob");
    assert_eq!(read_data, data);
}

#[test]
fn blob_hash_is_correct() {
    let (_tmp, store) = open_tmp_store();
    let data = b"some content";
    let expected_hash = hash_bytes(data);
    let hash = store.write_blob(data).expect("write blob");
    assert_eq!(hash, expected_hash);
}

#[test]
fn blob_dedup_write_twice() {
    let (_tmp, store) = open_tmp_store();
    let data = b"duplicate me";

    let hash1 = store.write_blob(data).expect("write blob 1");
    let hash2 = store.write_blob(data).expect("write blob 2");

    // Same hash
    assert_eq!(hash1, hash2);

    // Only one file on disk
    let hex = hash_to_hex(&hash1);
    let shard = &hex[..2];
    let blob_path = store.blobs_dir().join(shard).join(&hex);
    assert!(blob_path.exists());
}

#[test]
fn blob_exists_check() {
    let (_tmp, store) = open_tmp_store();
    let data = b"check existence";
    let hash = store.write_blob(data).expect("write blob");

    assert!(store.blob_exists(&hash).expect("exists check"));
    let other_hash = hash_bytes(b"something else");
    assert!(!store.blob_exists(&other_hash).expect("exists check"));
}

#[test]
fn blob_read_not_found() {
    let (_tmp, store) = open_tmp_store();
    let hash = hash_bytes(b"nonexistent");
    let result = store.read_blob(&hash);
    assert!(result.is_err());
}

// ===========================================================================
// Recipe storage
// ===========================================================================

#[test]
fn recipe_store_and_get_roundtrip() {
    let (_tmp, store) = open_tmp_store();
    let recipe = make_file_recipe();
    let bytes = recipe.encode();

    let hash = store.store_recipe(&bytes).expect("store recipe");
    let retrieved = store.get_recipe(&hash).expect("get recipe");

    assert_eq!(retrieved, bytes);
}

#[test]
fn recipe_hash_matches_encode() {
    let (_tmp, store) = open_tmp_store();
    let recipe = make_file_recipe();
    let bytes = recipe.encode();
    let expected_hash = hash_bytes(&bytes);

    let hash = store.store_recipe(&bytes).expect("store recipe");
    assert_eq!(hash, expected_hash);
}

#[test]
fn recipe_exists_check() {
    let (_tmp, store) = open_tmp_store();
    let recipe = make_file_recipe();
    let bytes = recipe.encode();
    let hash = store.store_recipe(&bytes).expect("store recipe");

    assert!(store.recipe_exists(&hash).expect("exists check"));
    let other_hash = hash_bytes(b"not a recipe");
    assert!(!store.recipe_exists(&other_hash).expect("exists check"));
}

#[test]
fn recipe_store_idempotent() {
    let (_tmp, store) = open_tmp_store();
    let recipe = make_file_recipe();
    let bytes = recipe.encode();

    let hash1 = store.store_recipe(&bytes).expect("store 1");
    let hash2 = store.store_recipe(&bytes).expect("store 2");

    assert_eq!(hash1, hash2);
}

#[test]
fn recipe_get_not_found() {
    let (_tmp, store) = open_tmp_store();
    let hash = hash_bytes(b"nonexistent recipe");
    let result = store.get_recipe(&hash);
    assert!(result.is_err());
}

#[test]
fn recipe_store_rejects_invalid_envelope() {
    let (_tmp, store) = open_tmp_store();
    let bad_bytes = b"NOT_HOD_GARBAGE";
    let result = store.store_recipe(bad_bytes);
    assert!(result.is_err());
}

#[test]
fn recipe_store_multiple_types() {
    let (_tmp, store) = open_tmp_store();

    let file_recipe = Recipe::File(RecipeFile {
        content_blob_hash: test_hash(),
        executable: true,
        resources_hash: None,
    });
    let symlink_recipe = Recipe::Symlink(RecipeSymlink {
        target: "../foo".into(),
    });
    let process_recipe = Recipe::Process(RecipeProcess {
        platform: "x86_64-linux".into(),
        command: "/bin/sh".into(),
        args: vec![],
        env: vec![],
        dependencies: vec![],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0x00,
    });

    let h1 = store.store_recipe(&file_recipe.encode()).expect("store file");
    let h2 = store.store_recipe(&symlink_recipe.encode()).expect("store symlink");
    let h3 = store.store_recipe(&process_recipe.encode()).expect("store process");

    assert_ne!(h1, h2);
    assert_ne!(h2, h3);

    // All retrievable
    assert_eq!(store.get_recipe(&h1).unwrap(), file_recipe.encode());
    assert_eq!(store.get_recipe(&h2).unwrap(), symlink_recipe.encode());
    assert_eq!(store.get_recipe(&h3).unwrap(), process_recipe.encode());
}

// ===========================================================================
// Output storage
// ===========================================================================

#[test]
fn output_store_and_lookup() {
    let (_tmp, store) = open_tmp_store();
    let recipe_hash = test_hash();
    let output_hash = test_hash_b();

    store
        .store_output(&recipe_hash, &output_hash, 42)
        .expect("store output");

    let found = store.get_output(&recipe_hash).expect("get output");
    assert_eq!(found, Some(output_hash));
}

#[test]
fn output_not_found() {
    let (_tmp, store) = open_tmp_store();
    let recipe_hash = test_hash();
    let found = store.get_output(&recipe_hash).expect("get output");
    assert_eq!(found, None);
}

#[test]
fn output_overwrite_on_rebuild() {
    let (_tmp, store) = open_tmp_store();
    let recipe_hash = test_hash();
    let output_hash_v1 = test_hash();
    let output_hash_v2 = test_hash_b();

    store
        .store_output(&recipe_hash, &output_hash_v1, 10)
        .expect("store v1");
    store
        .store_output(&recipe_hash, &output_hash_v2, 20)
        .expect("store v2");

    let found = store.get_output(&recipe_hash).expect("get output");
    assert_eq!(found, Some(output_hash_v2)); // latest wins
}

// ===========================================================================
// Build logs
// ===========================================================================

#[test]
fn build_log_store_and_retrieve() {
    let (_tmp, store) = open_tmp_store();
    let recipe_hash = test_hash();
    let stdout_hash = Some(hash_bytes(b"stdout output"));
    let stderr_hash = Some(hash_bytes(b"stderr output"));

    store
        .store_build_log(
            &recipe_hash,
            stdout_hash.as_ref(),
            stderr_hash.as_ref(),
            0,
        )
        .expect("store log");

    let log = store
        .get_build_log(&recipe_hash)
        .expect("get log")
        .expect("log should exist");

    assert_eq!(log.stdout_blob, stdout_hash);
    assert_eq!(log.stderr_blob, stderr_hash);
    assert_eq!(log.exit_code, 0);
}

#[test]
fn build_log_failure_exit_code() {
    let (_tmp, store) = open_tmp_store();
    let recipe_hash = test_hash();

    store
        .store_build_log(&recipe_hash, None, None, 1)
        .expect("store log");

    let log = store.get_build_log(&recipe_hash).unwrap().unwrap();
    assert_eq!(log.exit_code, 1);
    assert_eq!(log.stdout_blob, None);
    assert_eq!(log.stderr_blob, None);
}

#[test]
fn build_log_not_found() {
    let (_tmp, store) = open_tmp_store();
    let recipe_hash = test_hash();
    let found = store.get_build_log(&recipe_hash).expect("query");
    assert!(found.is_none());
}

// ===========================================================================
// Dependencies
// ===========================================================================

#[test]
fn dependencies_store_and_query() {
    let (_tmp, store) = open_tmp_store();
    let recipe_hash = test_hash();
    let deps = vec![
        (Some("bash".into()), test_hash()),
        (Some("coreutils".into()), test_hash_b()),
    ];

    store
        .store_dependencies(&recipe_hash, &deps)
        .expect("store deps");

    let retrieved = store.get_dependencies(&recipe_hash).expect("get deps");

    assert_eq!(retrieved.len(), 2);
    // Order is not guaranteed by SQLite, so check by name
    let names: Vec<&str> = retrieved
        .iter()
        .filter_map(|(n, _): &(Option<String>, Hash)| n.as_deref())
        .collect();
    assert!(names.contains(&"bash"));
    assert!(names.contains(&"coreutils"));
}

#[test]
fn dependencies_none_for_unknown_recipe() {
    let (_tmp, store) = open_tmp_store();
    let recipe_hash = test_hash();
    let retrieved = store.get_dependencies(&recipe_hash).expect("get deps");
    assert!(retrieved.is_empty());
}

#[test]
fn dependencies_are_replaced_on_rebuild() {
    let (_tmp, store) = open_tmp_store();
    let recipe_hash = test_hash();

    let deps_v1 = vec![(Some("bash".into()), test_hash())];
    let deps_v2 = vec![
        (Some("bash".into()), test_hash()),
        (Some("coreutils".into()), test_hash_b()),
    ];

    store
        .store_dependencies(&recipe_hash, &deps_v1)
        .expect("store v1");
    store
        .store_dependencies(&recipe_hash, &deps_v2)
        .expect("store v2");

    let retrieved = store.get_dependencies(&recipe_hash).expect("get deps");
    assert_eq!(retrieved.len(), 2); // v2, not 3
}

#[test]
fn dependencies_with_null_name() {
    let (_tmp, store) = open_tmp_store();
    let recipe_hash = test_hash();
    // Directory entries don't have names (dep_name is NULL)
    let deps = vec![(None, test_hash()), (None, test_hash_b())];

    store
        .store_dependencies(&recipe_hash, &deps)
        .expect("store deps");

    let retrieved = store.get_dependencies(&recipe_hash).expect("get deps");
    assert_eq!(retrieved.len(), 2);
    assert!(retrieved.iter().all(|(n, _): &(Option<String>, Hash)| n.is_none()));
}
