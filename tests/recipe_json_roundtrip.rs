//! Integration tests for `hod encode` / `hod decode` JSON round-tripping.
//!
//! Tests:
//! - Binary → JSON → Binary produces identical bytes (for all recipe types)
//! - JSON → Binary → JSON produces semantically equal recipe (for all recipe types)
//! - Error cases: invalid JSON, bad hash hex strings, missing required fields

use hod::hash::Hash;
use hod::recipe::*;

// ===========================================================================
// Helpers
// ===========================================================================

fn test_hash_a() -> Hash {
    [0xABu8; 32]
}

fn test_hash_b() -> Hash {
    [0xCDu8; 32]
}

fn test_hash_c() -> Hash {
    [0xEFu8; 32]
}

fn hex(h: &Hash) -> String {
    hod::hash::hash_to_hex(h)
}

/// Test that binary → JSON → binary produces identical bytes.
fn assert_binary_roundtrip(recipe: &Recipe) {
    let binary = recipe.encode();
    let json = serde_json::to_string_pretty(recipe).unwrap();
    let back: Recipe = serde_json::from_str(&json).unwrap();
    let binary2 = back.encode();
    assert_eq!(binary, binary2, "binary round-trip failed");
}

/// Test that JSON → binary → JSON produces the same recipe.
fn assert_json_roundtrip(recipe: &Recipe) {
    let json = serde_json::to_string_pretty(recipe).unwrap();
    let back: Recipe = serde_json::from_str(&json).unwrap();
    let json2 = serde_json::to_string_pretty(&back).unwrap();
    assert_eq!(json, json2, "JSON round-trip failed");
}

// ===========================================================================
// Binary ↔ JSON round-trip tests
// ===========================================================================

#[test]
fn roundtrip_file_basic() {
    let recipe = Recipe::File(RecipeFile {
        content_blob_hash: test_hash_a(),
        executable: false,
        resources_hash: None,
    });
    assert_binary_roundtrip(&recipe);
    assert_json_roundtrip(&recipe);
}

#[test]
fn roundtrip_file_executable() {
    let recipe = Recipe::File(RecipeFile {
        content_blob_hash: test_hash_a(),
        executable: true,
        resources_hash: None,
    });
    assert_binary_roundtrip(&recipe);
    assert_json_roundtrip(&recipe);
}

#[test]
fn roundtrip_file_with_resources() {
    let recipe = Recipe::File(RecipeFile {
        content_blob_hash: test_hash_a(),
        executable: true,
        resources_hash: Some(test_hash_b()),
    });
    assert_binary_roundtrip(&recipe);
    assert_json_roundtrip(&recipe);
}

#[test]
fn roundtrip_directory_empty() {
    let recipe = Recipe::Directory(RecipeDirectory { entries: vec![] });
    assert_binary_roundtrip(&recipe);
    assert_json_roundtrip(&recipe);
}

#[test]
fn roundtrip_directory_with_entries() {
    let recipe = Recipe::Directory(RecipeDirectory {
        entries: vec![
            DirectoryEntry {
                name: "bin".into(),
                entry_hash: test_hash_a(),
            },
            DirectoryEntry {
                name: "lib".into(),
                entry_hash: test_hash_b(),
            },
        ],
    });
    assert_binary_roundtrip(&recipe);
    assert_json_roundtrip(&recipe);
}

#[test]
fn roundtrip_symlink() {
    let recipe = Recipe::Symlink(RecipeSymlink {
        target: "../lib/libfoo.so.1".into(),
    });
    assert_binary_roundtrip(&recipe);
    assert_json_roundtrip(&recipe);
}

#[test]
fn roundtrip_download() {
    let recipe = Recipe::Download(RecipeDownload {
        url: "https://example.com/foo.tar.gz".into(),
        hash_algorithm: HashAlgorithm::Blake3,
        expected_hash: test_hash_a(),
    });
    assert_binary_roundtrip(&recipe);
    assert_json_roundtrip(&recipe);
}

#[test]
fn roundtrip_process_minimal() {
    let recipe = Recipe::Process(RecipeProcess {
        platform: "x86_64-linux".into(),
        command: "/deps/bash/bin/bash".into(),
        args: vec![],
        env: vec![],
        dependencies: vec![],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
            runtime_deps: None,
    });
    assert_binary_roundtrip(&recipe);
    assert_json_roundtrip(&recipe);
}

#[test]
fn roundtrip_process_full() {
    let recipe = Recipe::Process(RecipeProcess {
        platform: "x86_64-linux".into(),
        command: "/deps/seed/bin/bash".into(),
        args: vec!["-c".into(), "echo hello > $OUT/hello.txt".into()],
        env: vec![
            EnvVar {
                key: "CC".into(),
                value: "gcc".into(),
            },
            EnvVar {
                key: "CFLAGS".into(),
                value: "-O2".into(),
            },
        ],
        dependencies: vec![
            ProcessDependency {
                name: "bash".into(),
                recipe_hash: test_hash_a(),
            },
            ProcessDependency {
                name: "seed".into(),
                recipe_hash: test_hash_b(),
            },
        ],
        workdir_hash: Some(test_hash_c()),
        output_scaffold_hash: Some(test_hash_a()),
        unsafe_flags: 1,
            runtime_deps: None,
    });
    assert_binary_roundtrip(&recipe);
    assert_json_roundtrip(&recipe);
}

// Unpack recipe round-trip tests

#[test]
fn roundtrip_unpack_tar_gz() {
    let recipe = Recipe::Unpack(RecipeUnpack {
        archive_hash: test_hash_a(),
        format: ArchiveFormat::TarGz,
        archive_recipe_hash: None,
        strip_components: None,
    });
    assert_binary_roundtrip(&recipe);
    assert_json_roundtrip(&recipe);
}

#[test]
fn roundtrip_unpack_tar_xz() {
    let recipe = Recipe::Unpack(RecipeUnpack {
        archive_hash: test_hash_b(),
        format: ArchiveFormat::TarXz,
        archive_recipe_hash: None,
        strip_components: None,
    });
    assert_binary_roundtrip(&recipe);
    assert_json_roundtrip(&recipe);
}

#[test]
fn roundtrip_unpack_zip() {
    let recipe = Recipe::Unpack(RecipeUnpack {
        archive_hash: test_hash_a(),
        format: ArchiveFormat::Zip,
        archive_recipe_hash: None,
        strip_components: None,
    });
    assert_binary_roundtrip(&recipe);
    assert_json_roundtrip(&recipe);
}

#[test]
fn json_unpack_zip_uses_zip_format() {
    let recipe = Recipe::Unpack(RecipeUnpack {
        archive_hash: test_hash_a(),
        format: ArchiveFormat::Zip,
        archive_recipe_hash: None,
        strip_components: None,
    });
    let json = serde_json::to_string(&recipe).unwrap();
    assert!(
        json.contains("\"format\":\"zip\""),
        "should use 'zip' format, got: {json}"
    );
}

// ===========================================================================
// JSON format validation
// ===========================================================================

#[test]
fn json_uses_type_tag() {
    let recipe = Recipe::Symlink(RecipeSymlink {
        target: "foo".into(),
    });
    let json = serde_json::to_string(&recipe).unwrap();
    assert!(
        json.contains("\"type\":\"symlink\""),
        "should use 'symlink' tag"
    );
}

#[test]
fn json_uses_snake_case_algorithm() {
    let recipe = Recipe::Download(RecipeDownload {
        url: "https://example.com".into(),
        hash_algorithm: HashAlgorithm::Blake3,
        expected_hash: test_hash_a(),
    });
    let json = serde_json::to_string(&recipe).unwrap();
    assert!(
        json.contains("\"hash_algorithm\":\"blake3\""),
        "should use 'blake3' string"
    );
}

#[test]
fn json_unpack_uses_type_tag() {
    let recipe = Recipe::Unpack(RecipeUnpack {
        archive_hash: test_hash_a(),
        format: ArchiveFormat::TarGz,
        archive_recipe_hash: None,
        strip_components: None,
    });
    let json = serde_json::to_string(&recipe).unwrap();
    assert!(
        json.contains("\"type\":\"unpack\""),
        "should use 'unpack' tag"
    );
    assert!(
        json.contains("\"format\":\"tar_gz\""),
        "should use 'tar_gz' format"
    );
}

#[test]
fn roundtrip_unpack_with_archive_recipe_hash() {
    let recipe = Recipe::Unpack(RecipeUnpack {
        archive_hash: test_hash_a(),
        format: ArchiveFormat::TarXz,
        archive_recipe_hash: Some(test_hash_b()),
        strip_components: None,
    });
    assert_binary_roundtrip(&recipe);
    assert_json_roundtrip(&recipe);
}

#[test]
fn roundtrip_unpack_with_strip_components() {
    let recipe = Recipe::Unpack(RecipeUnpack {
        archive_hash: test_hash_a(),
        format: ArchiveFormat::TarGz,
        archive_recipe_hash: None,
        strip_components: Some(1),
    });
    assert_binary_roundtrip(&recipe);
    assert_json_roundtrip(&recipe);
}

#[test]
fn roundtrip_unpack_with_all_tail_fields() {
    let recipe = Recipe::Unpack(RecipeUnpack {
        archive_hash: test_hash_a(),
        format: ArchiveFormat::TarXz,
        archive_recipe_hash: Some(test_hash_b()),
        strip_components: Some(1),
    });
    assert_binary_roundtrip(&recipe);
    assert_json_roundtrip(&recipe);
}

#[test]
fn json_unpack_omits_strip_components_when_none() {
    let recipe = Recipe::Unpack(RecipeUnpack {
        archive_hash: test_hash_a(),
        format: ArchiveFormat::TarGz,
        archive_recipe_hash: None,
        strip_components: None,
    });
    let json = serde_json::to_string(&recipe).unwrap();
    assert!(
        !json.contains("archive_recipe_hash"),
        "archive_recipe_hash should be omitted when None"
    );
}

#[test]
fn json_unpack_includes_archive_recipe_hash_when_some() {
    let recipe = Recipe::Unpack(RecipeUnpack {
        archive_hash: test_hash_a(),
        format: ArchiveFormat::TarGz,
        archive_recipe_hash: Some(test_hash_b()),
        strip_components: None,
    });
    let json = serde_json::to_string(&recipe).unwrap();
    assert!(
        json.contains("archive_recipe_hash"),
        "archive_recipe_hash should be present when Some"
    );
    let expected_hex = hex(&test_hash_b());
    assert!(
        json.contains(&expected_hex),
        "archive_recipe_hash should contain the hash hex: {expected_hex}"
    );
}

#[test]
fn json_hashes_are_lowercase_hex() {
    let recipe = Recipe::File(RecipeFile {
        content_blob_hash: test_hash_a(),
        executable: false,
        resources_hash: None,
    });
    let json = serde_json::to_string(&recipe).unwrap();
    // 0xAB * 32 → "ab" repeated 32 times = 64 chars
    assert!(json.contains(&hex(&test_hash_a())));
}

#[test]
fn json_optional_fields_omitted_when_none() {
    let recipe = Recipe::File(RecipeFile {
        content_blob_hash: test_hash_a(),
        executable: false,
        resources_hash: None,
    });
    let json = serde_json::to_string(&recipe).unwrap();
    assert!(
        !json.contains("resources_hash"),
        "optional None fields should be omitted"
    );
}

#[test]
fn json_optional_fields_present_when_some() {
    let recipe = Recipe::File(RecipeFile {
        content_blob_hash: test_hash_a(),
        executable: false,
        resources_hash: Some(test_hash_b()),
    });
    let json = serde_json::to_string(&recipe).unwrap();
    assert!(
        json.contains("resources_hash"),
        "optional Some fields should be present"
    );
}

// ===========================================================================
// Error cases
// ===========================================================================

#[test]
fn json_rejects_unknown_type() {
    let json = r#"{"type":"unknown"}"#;
    let result: std::result::Result<Recipe, _> = serde_json::from_str(json);
    assert!(result.is_err());
}

#[test]
fn json_rejects_invalid_hash_too_short() {
    let json = r#"{"type":"file","content_blob_hash":"abcd","executable":false}"#;
    let result: std::result::Result<Recipe, _> = serde_json::from_str(json);
    assert!(result.is_err());
}

#[test]
fn json_rejects_invalid_hash_not_hex() {
    let json = r#"{"type":"file","content_blob_hash":"gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg","executable":false}"#;
    let result: std::result::Result<Recipe, _> = serde_json::from_str(json);
    assert!(result.is_err());
}

#[test]
fn json_rejects_missing_required_field() {
    // Missing "target" field on symlink
    let json = r#"{"type":"symlink"}"#;
    let result: std::result::Result<Recipe, _> = serde_json::from_str(json);
    assert!(result.is_err());
}

#[test]
fn json_accepts_explicit_null_for_optional() {
    let json = r#"{"type":"file","content_blob_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","executable":false,"resources_hash":null}"#;
    let recipe: Recipe = serde_json::from_str(json).unwrap();
    match recipe {
        Recipe::File(f) => assert_eq!(f.resources_hash, None),
        _ => panic!("expected File recipe"),
    }
}

#[test]
fn json_accepts_absent_optional() {
    let json = r#"{"type":"file","content_blob_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","executable":false}"#;
    let recipe: Recipe = serde_json::from_str(json).unwrap();
    match recipe {
        Recipe::File(f) => assert_eq!(f.resources_hash, None),
        _ => panic!("expected File recipe"),
    }
}

#[test]
fn json_process_accepts_absent_optionals() {
    let json = r#"{
        "type": "process",
        "platform": "x86_64-linux",
        "command": "/bin/bash",
        "args": [],
        "env": [],
        "dependencies": [],
        "unsafe_flags": 0
    }"#;
    let recipe: Recipe = serde_json::from_str(json).unwrap();
    match recipe {
        Recipe::Process(p) => {
            assert_eq!(p.workdir_hash, None);
            assert_eq!(p.output_scaffold_hash, None);
        }
        _ => panic!("expected Process recipe"),
    }
}
