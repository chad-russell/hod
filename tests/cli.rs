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
    let path = tmp
        .path()
        .join(format!("{}.hod", &hash_to_hex(&hash)[..16]));
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

/// Run `hod import-from-json` with JSON on stdin.
fn run_import_from_json(json: &str, store_path: &std::path::Path) -> std::process::Output {
    use std::io::Write;
    let mut child = Command::new(hod_bin())
        .args(["import-from-json", "--store", store_path.to_str().unwrap()])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .expect("failed to run hod");
    {
        let stdin = child.stdin.as_mut().unwrap();
        stdin.write_all(json.as_bytes()).unwrap();
    }
    child.wait_with_output().expect("failed to wait for hod")
}

/// Run `hod import-recipe` with the given arguments.
fn run_import_recipe(
    recipe_path: &std::path::Path,
    store_path: &std::path::Path,
) -> std::process::Output {
    Command::new(hod_bin())
        .args([
            "import-recipe",
            recipe_path.to_str().unwrap(),
            "--store",
            store_path.to_str().unwrap(),
        ])
        .output()
        .expect("failed to run hod")
}

/// Run `hod inspect` with the given arguments.
fn run_inspect(hash: &str, store_path: &std::path::Path) -> std::process::Output {
    Command::new(hod_bin())
        .args(["inspect", hash, "--store", store_path.to_str().unwrap()])
        .output()
        .expect("failed to run hod")
}

/// Run `hod export-recipe` with the given arguments.
fn run_export_recipe(
    hash: &str,
    output: &std::path::Path,
    store_path: &std::path::Path,
) -> std::process::Output {
    Command::new(hod_bin())
        .args([
            "export-recipe",
            hash,
            "--output",
            output.to_str().unwrap(),
            "--store",
            store_path.to_str().unwrap(),
        ])
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
    let mut args = vec!["ls-output", hash, "--store", store_path.to_str().unwrap()];
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

fn bun_available() -> bool {
    Command::new("bun")
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
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

    assert!(
        output.status.success(),
        "build should succeed, stderr: {stderr}"
    );

    // stdout should contain exactly the output hash (one line, 64 hex chars)
    let hash_line = stdout.trim();
    assert_eq!(
        hash_line.len(),
        64,
        "output should be 64 hex chars, got: {hash_line}"
    );
    assert!(
        hash_line.chars().all(|c| c.is_ascii_hexdigit()),
        "output should be hex: {hash_line}"
    );

    // Verify the hash is valid by looking it up in the store
    let recipe_hash = recipe.recipe_hash();
    let stored_output = store.get_output(&recipe_hash).unwrap().unwrap();
    assert_eq!(hash_to_hex(&stored_output), hash_line);
}

#[test]
fn build_typescript_recipe_prints_hash_exit_0() {
    if !bun_available() {
        eprintln!("skipping: bun is not available");
        return;
    }

    let (tmp, store) = test_store();
    let fixture = tmp.path().join("hello.txt");
    std::fs::write(&fixture, b"hello from ts recipe\n").unwrap();

    let sdk = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("js/src/index.js");
    let recipe_path = tmp.path().join("hello.ts");
    std::fs::write(
        &recipe_path,
        format!(
            r#"import {{ fileFromPath, importToStore }} from "{}";

const recipe = await fileFromPath("{}", {{ executable: false }});
await importToStore(recipe);
"#,
            sdk.display(),
            fixture.display(),
        ),
    )
    .unwrap();

    let output = Command::new(hod_bin())
        .args([
            "build",
            recipe_path.to_str().unwrap(),
            "--store",
            store.root().to_str().unwrap(),
            "--quiet",
        ])
        .env("HOD_BIN", hod_bin())
        .output()
        .expect("failed to run hod build");

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        output.status.success(),
        "build should succeed, stderr: {stderr}"
    );

    let hash_line = stdout.trim();
    assert_eq!(
        hash_line.len(),
        64,
        "output should be 64 hex chars, got: {hash_line}"
    );
    assert!(
        hash_line.chars().all(|c| c.is_ascii_hexdigit()),
        "output should be hex: {hash_line}"
    );
}

#[test]
fn build_invalid_file_exit_3() {
    let (tmp, store) = test_store();

    // Write garbage data as a .hod file
    let bad_path = tmp.path().join("bad.hod");
    std::fs::write(&bad_path, b"this is not a valid recipe").unwrap();

    let output = run_build(&bad_path, store.root());

    assert_eq!(
        output.status.code(),
        Some(3),
        "invalid recipe should exit 3"
    );
}

#[test]
fn build_nonexistent_file_exit_3() {
    let (tmp, store) = test_store();

    let output = run_build(&tmp.path().join("nonexistent.hod"), store.root());

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

    assert_eq!(
        output.status.code(),
        Some(4),
        "missing dependency should exit 4"
    );
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
    build::build(
        &store,
        &file_bytes,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    )
    .unwrap();

    let dir_recipe = Recipe::Directory(RecipeDirectory {
        entries: vec![DirectoryEntry {
            name: "data.txt".to_string(),
            entry_hash: file_recipe.recipe_hash(),
        }],
    });

    let recipe_path = write_recipe_file(&tmp, &dir_recipe);
    let output = run_build(&recipe_path, store.root());

    assert!(
        output.status.success(),
        "directory build should succeed, stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
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

    let output_hash = String::from_utf8_lossy(&build_output.stdout)
        .trim()
        .to_string();

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
    assert_eq!(
        output.status.code(),
        Some(4),
        "unknown output should exit 4"
    );
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
    let output_hash = String::from_utf8_lossy(&build_output.stdout)
        .trim()
        .to_string();

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
    build::build(
        &store,
        &bytes_a,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    )
    .unwrap();
    build::build(
        &store,
        &bytes_b,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    )
    .unwrap();

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

    let output_hash = String::from_utf8_lossy(&build_output.stdout)
        .trim()
        .to_string();

    // List the output (non-recursive)
    let ls_output = run_ls_output(&output_hash, store.root());
    assert!(ls_output.status.success());

    let listing = String::from_utf8_lossy(&ls_output.stdout).to_string();
    assert!(
        listing.contains("alpha.txt"),
        "listing should contain alpha.txt, got: {listing}"
    );
    assert!(
        listing.contains("beta.sh"),
        "listing should contain beta.sh, got: {listing}"
    );
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

// ---------------------------------------------------------------------------
// Tests: `hod inspect`
// ---------------------------------------------------------------------------

#[test]
fn inspect_returns_valid_json_for_imported_recipe() {
    let (tmp, store) = test_store();
    let content = b"inspect test content\n";
    let recipe = setup_file_recipe(&store, content, true);
    let recipe_path = write_recipe_file(&tmp, &recipe);
    let recipe_hash = hash_to_hex(&hash_bytes(&recipe.encode()));

    // Import the recipe into the store
    let import_output = run_import_recipe(&recipe_path, store.root());
    assert!(
        import_output.status.success(),
        "import-recipe should succeed, stderr: {}",
        String::from_utf8_lossy(&import_output.stderr),
    );
    let imported_hash = String::from_utf8_lossy(&import_output.stdout)
        .trim()
        .to_string();
    assert_eq!(imported_hash, recipe_hash);

    // Inspect it
    let inspect_output = run_inspect(&recipe_hash, store.root());
    assert!(
        inspect_output.status.success(),
        "inspect should succeed, stderr: {}",
        String::from_utf8_lossy(&inspect_output.stderr),
    );

    let json_str = String::from_utf8_lossy(&inspect_output.stdout).to_string();
    let json: serde_json::Value =
        serde_json::from_str(&json_str).expect("inspect output should be valid JSON");

    // Should be a file recipe with executable=true
    assert_eq!(json["type"], "file");
    assert_eq!(json["executable"], true);
    assert_eq!(json["content_blob_hash"], hash_to_hex(&hash_bytes(content)));
}

#[test]
fn inspect_download_recipe() {
    let (tmp, store) = test_store();
    let recipe = Recipe::Download(RecipeDownload {
        url: "https://example.com/test.tar.gz".to_string(),
        hash_algorithm: HashAlgorithm::Blake3,
        expected_hash: hash_bytes(b"test content"),
    });
    let recipe_path = write_recipe_file(&tmp, &recipe);
    let recipe_hash = hash_to_hex(&hash_bytes(&recipe.encode()));

    // Import and inspect
    let import_output = run_import_recipe(&recipe_path, store.root());
    assert!(import_output.status.success());

    let inspect_output = run_inspect(&recipe_hash, store.root());
    assert!(inspect_output.status.success());

    let json: serde_json::Value =
        serde_json::from_str(&String::from_utf8_lossy(&inspect_output.stdout)).unwrap();
    assert_eq!(json["type"], "download");
    assert_eq!(json["url"], "https://example.com/test.tar.gz");
    assert_eq!(json["hash_algorithm"], "blake3");
}

#[test]
fn inspect_process_recipe_shows_dependencies() {
    let (tmp, store) = test_store();
    let dep_hash = hash_bytes(b"some dependency");
    let recipe = Recipe::Process(RecipeProcess {
        platform: "x86_64-linux".to_string(),
        command: "/bin/sh".to_string(),
        args: vec!["-c".to_string(), "echo hello".to_string()],
        env: vec![EnvVar {
            key: "PATH".to_string(),
            value: "/usr/bin".to_string(),
        }],
        dependencies: vec![ProcessDependency {
            name: "tools".to_string(),
            recipe_hash: dep_hash,
        }],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });
    let recipe_path = write_recipe_file(&tmp, &recipe);
    let recipe_hash = hash_to_hex(&hash_bytes(&recipe.encode()));

    let import_output = run_import_recipe(&recipe_path, store.root());
    assert!(import_output.status.success());

    let inspect_output = run_inspect(&recipe_hash, store.root());
    assert!(inspect_output.status.success());

    let json: serde_json::Value =
        serde_json::from_str(&String::from_utf8_lossy(&inspect_output.stdout)).unwrap();
    assert_eq!(json["type"], "process");
    assert_eq!(json["platform"], "x86_64-linux");
    let deps = json["dependencies"].as_array().unwrap();
    assert_eq!(deps.len(), 1);
    assert_eq!(deps[0]["name"], "tools");
    assert_eq!(deps[0]["recipe_hash"], hash_to_hex(&dep_hash));
}

#[test]
fn inspect_unknown_hash_exits_4() {
    let (_tmp, store) = test_store();
    let fake_hash = hash_to_hex(&hash_bytes(b"nonexistent recipe"));

    let output = run_inspect(&fake_hash, store.root());
    assert_eq!(
        output.status.code(),
        Some(4),
        "unknown recipe should exit 4"
    );
}

#[test]
fn inspect_invalid_hash_exits_3() {
    let (_tmp, store) = test_store();

    let output = run_inspect("not-a-valid-hash", store.root());
    assert_eq!(output.status.code(), Some(3), "invalid hash should exit 3");
}

// ---------------------------------------------------------------------------
// Tests: `hod export-recipe`
// ---------------------------------------------------------------------------

#[test]
fn export_recipe_writes_matching_bytes() {
    let (tmp, store) = test_store();
    let content = b"export test content\n";
    let recipe = setup_file_recipe(&store, content, false);
    let recipe_path = write_recipe_file(&tmp, &recipe);
    let recipe_bytes = recipe.encode();
    let recipe_hash = hash_to_hex(&hash_bytes(&recipe_bytes));

    // Import the recipe into the store
    let import_output = run_import_recipe(&recipe_path, store.root());
    assert!(import_output.status.success());

    // Export it to a new file
    let export_path = tmp.path().join("exported.hod");
    let export_output = run_export_recipe(&recipe_hash, &export_path, store.root());
    assert!(
        export_output.status.success(),
        "export-recipe should succeed, stderr: {}",
        String::from_utf8_lossy(&export_output.stderr),
    );

    // The exported file should be byte-for-byte identical to the original encoding
    let exported_bytes = std::fs::read(&export_path).unwrap();
    assert_eq!(
        exported_bytes, recipe_bytes,
        "exported bytes should match original encoding"
    );
}

#[test]
fn export_recipe_unknown_hash_exits_4() {
    let (tmp, store) = test_store();
    let fake_hash = hash_to_hex(&hash_bytes(b"nonexistent recipe"));

    let export_path = tmp.path().join("exported.hod");
    let output = run_export_recipe(&fake_hash, &export_path, store.root());
    assert_eq!(
        output.status.code(),
        Some(4),
        "unknown recipe should exit 4"
    );
}

#[test]
fn export_recipe_invalid_hash_exits_3() {
    let (tmp, store) = test_store();

    let export_path = tmp.path().join("exported.hod");
    let output = run_export_recipe("not-valid", &export_path, store.root());
    assert_eq!(output.status.code(), Some(3), "invalid hash should exit 3");
}

// ---------------------------------------------------------------------------
// Tests: `hod import-from-json`
// ---------------------------------------------------------------------------

#[test]
fn import_from_json_file_recipe() {
    let (_tmp, store) = test_store();
    let json = r#"{"type":"file","content_blob_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","executable":true}"#;

    let output = run_import_from_json(json, store.root());
    assert!(
        output.status.success(),
        "import-from-json should succeed, stderr: {}",
        String::from_utf8_lossy(&output.stderr),
    );

    let hash = String::from_utf8_lossy(&output.stdout).trim().to_string();
    assert_eq!(hash.len(), 64, "hash should be 64 hex chars");
    assert!(
        hash.chars().all(|c| c.is_ascii_hexdigit()),
        "hash should be hex: {hash}"
    );

    // Verify the recipe is in the store by inspecting it
    let inspect_output = run_inspect(&hash, store.root());
    assert!(inspect_output.status.success());
    let inspected: serde_json::Value =
        serde_json::from_str(&String::from_utf8_lossy(&inspect_output.stdout)).unwrap();
    assert_eq!(inspected["type"], "file");
    assert_eq!(inspected["executable"], true);
}

#[test]
fn import_from_json_hash_matches_encode() {
    let (tmp, store) = test_store();
    let json = r#"{"type":"file","content_blob_hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","executable":false}"#;

    // Encode via `hod encode` to get the canonical hash
    let json_path = tmp.path().join("test.json");
    std::fs::write(&json_path, json.as_bytes()).unwrap();
    let encode_output = Command::new(hod_bin())
        .args(["encode", json_path.to_str().unwrap()])
        .output()
        .expect("failed to run hod encode");
    let encode_hash = String::from_utf8_lossy(&encode_output.stdout)
        .trim()
        .to_string();

    // Import via `hod import-from-json`
    let output = run_import_from_json(json, store.root());
    assert!(output.status.success());
    let import_hash = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // Same hash
    assert_eq!(
        import_hash, encode_hash,
        "import-from-json hash should match hod encode hash"
    );
}

#[test]
fn import_from_json_invalid_json_exits_1() {
    let (_tmp, store) = test_store();
    let output = run_import_from_json("not valid json", store.root());
    assert_eq!(output.status.code(), Some(1), "invalid JSON should exit 1");
}

#[test]
fn import_from_json_missing_field_exits_1() {
    let (_tmp, store) = test_store();
    let output = run_import_from_json("{\"type\":\"file\"}", store.root());
    assert_eq!(output.status.code(), Some(1), "missing field should exit 1");
}

// ---------------------------------------------------------------------------
// 7. Tests: `hod build --hash`
// ---------------------------------------------------------------------------

/// Run `hod build --hash <hash>` with the given store.
fn run_build_hash(hash: &str, store_path: &std::path::Path) -> std::process::Output {
    Command::new(hod_bin())
        .args([
            "build",
            "--hash",
            hash,
            "--store",
            store_path.to_str().unwrap(),
            "--quiet",
        ])
        .output()
        .unwrap()
}

#[test]
fn build_hash_file_recipe_succeeds() {
    let (tmp, store) = test_store();

    // Create a file recipe and import it to the store
    let content = b"hello from hash build".as_slice();
    let content_hash = hash_bytes(content);
    let recipe = Recipe::File(RecipeFile {
        content_blob_hash: content_hash,
        executable: false,
        resources_hash: None,
    });
    let recipe_bytes = recipe.encode();
    let recipe_hash = recipe.recipe_hash();

    // Store the recipe and its content blob
    store.store_recipe(&recipe_bytes).unwrap();
    store.write_blob(content).unwrap();

    let hash_hex = hash_to_hex(&recipe_hash);

    // Build via --hash
    let output = run_build_hash(&hash_hex, store.root());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        output.status.success(),
        "build --hash should succeed, stderr: {stderr}"
    );

    // Output should be the output hash
    let stdout = String::from_utf8_lossy(&output.stdout);
    let output_hash = stdout.trim();
    assert_eq!(output_hash.len(), 64, "output hash should be 64 hex chars");
}

#[test]
fn build_hash_matches_file_build() {
    let (tmp, store) = test_store();

    // Create a file recipe
    let content = b"same content both ways".as_slice();
    let content_hash = hash_bytes(content);
    let recipe = Recipe::File(RecipeFile {
        content_blob_hash: content_hash,
        executable: false,
        resources_hash: None,
    });
    let recipe_bytes = recipe.encode();
    let recipe_hash = recipe.recipe_hash();

    // Store the recipe and content
    store.store_recipe(&recipe_bytes).unwrap();
    store.write_blob(content).unwrap();

    // Also write to disk for file-based build
    let recipe_path = write_recipe_file(&tmp, &recipe);

    // Build via file
    let file_output = run_build(&recipe_path, store.root());
    assert!(file_output.status.success());
    let file_hash = String::from_utf8_lossy(&file_output.stdout)
        .trim()
        .to_string();

    // Build via --hash
    let hash_output = run_build_hash(&hash_to_hex(&recipe_hash), store.root());
    assert!(hash_output.status.success());
    let hash_build_hash = String::from_utf8_lossy(&hash_output.stdout)
        .trim()
        .to_string();

    // Same output hash from both methods
    assert_eq!(
        file_hash, hash_build_hash,
        "file and hash builds should produce the same output"
    );
}

#[test]
fn build_hash_invalid_hash_exits_3() {
    let (_tmp, store) = test_store();
    let output = run_build_hash("not-a-hash", store.root());
    assert_eq!(output.status.code(), Some(3), "invalid hash should exit 3");
}

#[test]
fn build_hash_unknown_hash_exits_4() {
    let (_tmp, store) = test_store();
    let fake_hash = "a".repeat(64);
    let output = run_build_hash(&fake_hash, store.root());
    assert_eq!(output.status.code(), Some(4), "unknown hash should exit 4");
}

#[test]
fn build_hash_and_file_mutually_exclusive_exits_3() {
    let (tmp, store) = test_store();

    // Create a dummy recipe file
    let recipe = Recipe::File(RecipeFile {
        content_blob_hash: hash_bytes(b"test"),
        executable: false,
        resources_hash: None,
    });
    let recipe_path = write_recipe_file(&tmp, &recipe);

    let output = Command::new(hod_bin())
        .args([
            "build",
            recipe_path.to_str().unwrap(),
            "--hash",
            &"b".repeat(64),
            "--store",
            store.root().to_str().unwrap(),
        ])
        .output()
        .unwrap();

    assert_eq!(
        output.status.code(),
        Some(3),
        "specifying both should exit 3"
    );
}

#[test]
fn build_neither_file_nor_hash_exits_3() {
    let (_tmp, store) = test_store();

    let output = Command::new(hod_bin())
        .args(["build", "--store", store.root().to_str().unwrap()])
        .output()
        .unwrap();

    assert_eq!(
        output.status.code(),
        Some(3),
        "neither file nor hash should exit 3"
    );
}
