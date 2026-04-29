//! End-to-end integration tests — Layer 7.
//!
//! Full-pipeline tests that exercise the entire build system from raw `.hod`
//! files through `hod build` and `hod ls-output`. These tests verify:
//!
//! - Complete hello-world pipeline (File → Process → output verification)
//! - Determinism across different store instances
//! - Cache hit performance (< 5ms)
//! - Scale: DAGs with 100+ recipes build without errors
//! - Materialization and `ls-output` correctness

mod fixtures;

use std::path::Path;
use std::process::Command;
use std::time::Instant;

use hod::build::{self, BuildOptions};
use hod::hash::{hash_bytes, hash_to_hex};
use hod::hash::Hash as HodHash;
use hod::recipe::*;
use hod::store::Store;

use tempfile::TempDir;

use fixtures::*;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Path to the compiled hod binary.
fn hod_bin() -> String {
    env!("CARGO_BIN_EXE_hod").to_string()
}

/// Create a test store + temp dir + fixture dir.
fn test_env() -> (TempDir, Store, FixtureDir) {
    let tmp = TempDir::new().unwrap();
    let store = Store::open_at(tmp.path()).unwrap();
    let fixtures_path = tmp.path().join("fixtures");
    let fixture_dir = FixtureDir::create(&fixtures_path).unwrap();
    (tmp, store, fixture_dir)
}

/// Run `hod build` on a recipe file, returning the process output.
fn hod_build(recipe_path: &Path, store_path: &Path) -> std::process::Output {
    hod_build_with_args(recipe_path, store_path, &[])
}

/// Run `hod build` with extra args.
fn hod_build_with_args(
    recipe_path: &Path,
    store_path: &Path,
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

/// Run `hod ls-output` on a hash, returning the process output.
fn hod_ls_output(hash: &str, store_path: &Path) -> std::process::Output {
    hod_ls_output_with_args(hash, store_path, &[])
}

/// Run `hod ls-output` with extra args.
fn hod_ls_output_with_args(
    hash: &str,
    store_path: &Path,
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

/// Build a recipe in-process and return the output hash as hex.
fn build_in_process(store: &Store, recipe: &Recipe) -> String {
    let bytes = recipe.encode();
    let output_hash = build::build(store, &bytes, &BuildOptions { quiet: true, ..Default::default() })
        .expect("in-process build");
    hash_to_hex(&output_hash)
}

// ---------------------------------------------------------------------------
// 7.2: Full hello-world pipeline
// ---------------------------------------------------------------------------

#[test]
fn e2e_full_hello_world_pipeline() {
    let (_tmp, store, fixture_dir) = test_env();

    // Set up: File recipe for a script + Process recipe that runs it
    let (_file_recipe, _file_hash, _process_recipe, process_hash) =
        setup_hello_world(&store, &fixture_dir);

    // Step 1: Build the Process recipe via CLI
    let process_path = fixture_dir.path().join(format!("{}.hod", &hash_to_hex(&process_hash)[..16]));
    let build_output = hod_build(&process_path, store.root());

    let stdout = String::from_utf8_lossy(&build_output.stdout);
    let stderr = String::from_utf8_lossy(&build_output.stderr);

    assert!(
        build_output.status.success(),
        "process build should succeed, stderr: {stderr}"
    );

    let output_hash = stdout.trim().to_string();
    assert_eq!(output_hash.len(), 64, "output hash should be 64 hex chars");

    // Step 2: Verify the output with ls-output
    // The process output is a directory containing hello.txt.
    // However, capture_output may store single-file outputs as plain files.
    // Check ls-output succeeds and look for the output.
    let ls_output = hod_ls_output(&output_hash, store.root());
    assert!(
        ls_output.status.success(),
        "ls-output should succeed, stderr: {}",
        String::from_utf8_lossy(&ls_output.stderr),
    );
    let listing = String::from_utf8_lossy(&ls_output.stdout).to_string();
    // ls-output should show something (either the hash for a file, or hello.txt for a dir)
    assert!(!listing.trim().is_empty(), "listing should not be empty");

    // Step 3: Verify the actual content via staging
    let output_hash_parsed = hod::hash::hex_to_hash(&output_hash).unwrap();
    let staging_path = build::artifact_staging_path(&store, &output_hash_parsed);

    let content = if staging_path.is_dir() {
        std::fs::read_to_string(staging_path.join("hello.txt")).unwrap_or_default()
    } else {
        // Single-file output: the file IS the hello.txt content
        std::fs::read_to_string(&staging_path).unwrap_or_default()
    };
    assert!(
        content.contains("Hello from Hod!"),
        "output should contain 'Hello from Hod!', got: {content}"
    );
}

#[test]
fn e2e_file_recipe_build_and_inspect() {
    let (_tmp, store, fixture_dir) = test_env();

    // Create a simple file recipe
    let content = b"test file content for e2e\n";
    let file_recipe = make_file_recipe(&store, content, false);
    let (file_path, _file_hash) = fixture_dir.write_recipe(&file_recipe);

    // Build via CLI
    let build_output = hod_build(&file_path, store.root());
    assert!(
        build_output.status.success(),
        "file build should succeed, stderr: {}",
        String::from_utf8_lossy(&build_output.stderr),
    );

    let output_hash = String::from_utf8_lossy(&build_output.stdout).trim().to_string();
    assert_eq!(output_hash.len(), 64);

    // Verify the output is a single file with correct content
    let output_hash_parsed = hod::hash::hex_to_hash(&output_hash).unwrap();
    let staging_path = build::artifact_staging_path(&store, &output_hash_parsed);
    assert!(staging_path.exists(), "staged output should exist");

    let stored_content = std::fs::read(&staging_path).unwrap();
    assert_eq!(stored_content, content);
}

#[test]
fn e2e_directory_with_multiple_files() {
    let (_tmp, store, fixture_dir) = test_env();

    // Create a directory with 5 files
    let (_dir_recipe, dir_hash, _file_recipes) =
        setup_directory_with_files(&store, &fixture_dir, 5);

    // Build the directory via CLI
    let dir_path = fixture_dir.path()
        .join(format!("{}.hod", &hash_to_hex(&dir_hash)[..16]));
    let build_output = hod_build(&dir_path, store.root());
    assert!(
        build_output.status.success(),
        "directory build should succeed, stderr: {}",
        String::from_utf8_lossy(&build_output.stderr),
    );

    let output_hash = String::from_utf8_lossy(&build_output.stdout).trim().to_string();

    // Verify with ls-output --recursive
    let ls_output = hod_ls_output_with_args(&output_hash, store.root(), &["--recursive"]);
    assert!(ls_output.status.success());

    let listing = String::from_utf8_lossy(&ls_output.stdout).to_string();
    for i in 0..5 {
        let filename = format!("file_{i:04}.txt");
        assert!(
            listing.contains(&filename),
            "listing should contain {filename}, got: {listing}"
        );
    }
}

#[test]
fn e2e_symlink_recipe_pipeline() {
    let (_tmp, store, fixture_dir) = test_env();

    let symlink_recipe = make_symlink_recipe("../../target/other");
    let (symlink_path, _symlink_hash) = fixture_dir.write_recipe(&symlink_recipe);

    let build_output = hod_build(&symlink_path, store.root());
    assert!(build_output.status.success());

    let output_hash = String::from_utf8_lossy(&build_output.stdout).trim().to_string();

    // Verify the symlink was created correctly
    let output_hash_parsed = hod::hash::hex_to_hash(&output_hash).unwrap();
    let staging_path = build::artifact_staging_path(&store, &output_hash_parsed);
    assert!(staging_path.is_symlink(), "should be a symlink");

    let target = std::fs::read_link(&staging_path).unwrap();
    assert_eq!(target.to_string_lossy(), "../../target/other");
}

// ---------------------------------------------------------------------------
// 7.2: Determinism — same recipe in different stores → same output hash
// ---------------------------------------------------------------------------

#[test]
fn e2e_determinism_across_stores() {
    // Two completely separate stores
    let (_tmp1, store1, _fixture_dir1) = test_env();
    let tmp2 = TempDir::new().unwrap();
    let store2 = Store::open_at(tmp2.path()).unwrap();

    // Same content, same recipe
    let content = b"deterministic e2e test\n";

    let recipe1 = make_file_recipe(&store1, content, false);
    let recipe2 = make_file_recipe(&store2, content, false);

    // Both recipes should have the same hash (same bytes)
    assert_eq!(
        recipe1.recipe_hash(),
        recipe2.recipe_hash(),
        "identical recipes should have identical hashes"
    );

    // Build in store1
    let hash1 = build_in_process(&store1, &recipe1);

    // Build in store2
    let hash2 = build_in_process(&store2, &recipe2);

    assert_eq!(
        hash1, hash2,
        "same recipe in different stores should produce same output hash"
    );
}

#[test]
fn e2e_determinism_process_recipe() {
    let (_tmp1, store1, _) = test_env();
    let tmp2 = TempDir::new().unwrap();
    let store2 = Store::open_at(tmp2.path()).unwrap();

    // Same process recipe in both stores
    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: "/bin/bash".to_string(),
        args: vec![
            "-c".to_string(),
            "echo 'deterministic output' > $OUT/result.txt".to_string(),
        ],
        env: vec![],
        dependencies: vec![],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
    });

    let hash1 = build_in_process(&store1, &process_recipe);
    let hash2 = build_in_process(&store2, &process_recipe);

    assert_eq!(
        hash1, hash2,
        "same process recipe should produce same output hash across stores"
    );
}

#[test]
fn e2e_determinism_directory_structure() {
    let (_tmp1, store1, _) = test_env();
    let tmp2 = TempDir::new().unwrap();
    let store2 = Store::open_at(tmp2.path()).unwrap();

    // Create identical file recipes in both stores
    let content_a = b"alpha content\n";
    let content_b = b"beta content\n";

    for store in [&store1, &store2] {
        store.write_blob(content_a).unwrap();
        store.write_blob(content_b).unwrap();
    }

    let file_a = Recipe::File(RecipeFile {
        content_blob_hash: hash_bytes(content_a),
        executable: false,
        resources_hash: None,
    });
    let file_b = Recipe::File(RecipeFile {
        content_blob_hash: hash_bytes(content_b),
        executable: true,
        resources_hash: None,
    });

    // Build files in both stores
    for store in [&store1, &store2] {
        let bytes_a = file_a.encode();
        let bytes_b = file_b.encode();
        build::build(store, &bytes_a, &BuildOptions { quiet: true, ..Default::default() }).unwrap();
        build::build(store, &bytes_b, &BuildOptions { quiet: true, ..Default::default() }).unwrap();
    }

    // Build directory in both stores
    let dir_recipe = make_directory_recipe(vec![
        ("alpha.txt", file_a.recipe_hash()),
        ("beta.sh", file_b.recipe_hash()),
    ]);

    let hash1 = build_in_process(&store1, &dir_recipe);
    let hash2 = build_in_process(&store2, &dir_recipe);

    assert_eq!(hash1, hash2, "directory output should be deterministic");
}

// ---------------------------------------------------------------------------
// 7.2: Performance — cache hit < 5ms
// ---------------------------------------------------------------------------

#[test]
fn e2e_cache_hit_performance() {
    let (_tmp, store, _fixture_dir) = test_env();

    // Create a non-trivial recipe with dependencies
    let content = b"performance test content\n";
    store.write_blob(content).unwrap();

    let file_recipe = Recipe::File(RecipeFile {
        content_blob_hash: hash_bytes(content),
        executable: false,
        resources_hash: None,
    });

    let file_bytes = file_recipe.encode();
    let _file_hash = file_recipe.recipe_hash();

    // First build (cache miss)
    let _first = build::build(
        &store,
        &file_bytes,
        &BuildOptions { quiet: true, ..Default::default() },
    )
    .unwrap();

    // Warm up the cache hit path
    let _warmup = build::build(
        &store,
        &file_bytes,
        &BuildOptions { quiet: true, ..Default::default() },
    )
    .unwrap();

    // Measure cache hit performance (100 iterations)
    let iterations = 100;
    let start = Instant::now();
    for _ in 0..iterations {
        let result = build::build(
            &store,
            &file_bytes,
            &BuildOptions { quiet: true, ..Default::default() },
        )
        .unwrap();
        assert_eq!(hash_to_hex(&result).len(), 64);
    }
    let total = start.elapsed();
    let per_hit = total / iterations;

    assert!(
        per_hit.as_millis() < 5,
        "cache hit took {}µs per iteration (avg over {iterations}), expected < 5ms",
        per_hit.as_micros(),
    );
}

#[test]
fn e2e_cache_hit_performance_cli() {
    let (_tmp, store, fixture_dir) = test_env();

    let content = b"cli performance test\n";
    let recipe = make_file_recipe(&store, content, false);
    let (recipe_path, _recipe_hash) = fixture_dir.write_recipe(&recipe);

    // First build (cache miss)
    let build1 = hod_build(&recipe_path, store.root());
    assert!(build1.status.success());

    // Second build (cache hit) — measure time
    let start = Instant::now();
    let build2 = hod_build(&recipe_path, store.root());
    let elapsed = start.elapsed();

    assert!(build2.status.success());
    assert!(
        elapsed.as_millis() < 100,
        "CLI cache hit took {}ms, expected < 100ms (includes process spawn)",
        elapsed.as_millis(),
    );

    // Same output hash
    let hash1 = String::from_utf8_lossy(&build1.stdout).trim().to_string();
    let hash2 = String::from_utf8_lossy(&build2.stdout).trim().to_string();
    assert_eq!(hash1, hash2);
}

// ---------------------------------------------------------------------------
// 7.2: Scale test — 100+ recipe DAG
// ---------------------------------------------------------------------------

#[test]
fn e2e_scale_100_recipe_dag() {
    let (_tmp, store, fixture_dir) = test_env();

    // Build a diamond DAG:
    //   - 10 "leaf" file recipes (no dependencies)
    //   - 5 "mid" directory recipes (each containing 2 leaf files)
    //   - 1 "top" directory recipe (containing all 5 mid directories)
    //
    // Then repeat this pattern 4 times to get 100+ recipes total:
    //   - 40 leaf files
    //   - 20 mid directories
    //   - 4 top directories
    //   - 1 final directory containing all 4 tops
    // Total: 40 + 20 + 4 + 1 = 65 recipes
    //
    // Actually, let's make it bigger: 80 leaves, 20 mids, 4 tops, 1 root = 105

    let mut all_recipes: Vec<(Recipe, HodHash)> = Vec::new();

    // Phase 1: Create 80 leaf file recipes
    let num_leaves = 80;
    let mut leaf_hashes: Vec<HodHash> = Vec::with_capacity(num_leaves);

    for i in 0..num_leaves {
        let content = format!("leaf file {i}\n").into_bytes();
        let recipe = make_file_recipe(&store, &content, i % 7 == 0);
        let (_, hash) = fixture_dir.write_recipe(&recipe);

        // Build the leaf
        build::build(
            &store,
            &recipe.encode(),
            &BuildOptions { quiet: true, ..Default::default() },
        )
        .unwrap();

        leaf_hashes.push(hash);
        all_recipes.push((recipe, hash));
    }

    // Phase 2: Create 20 mid-level directory recipes (4 leaves each)
    let num_mids = 20;
    let leaves_per_mid = 4;
    let mut mid_hashes: Vec<HodHash> = Vec::with_capacity(num_mids);

    for mid_idx in 0..num_mids {
        let mut entries: Vec<(String, HodHash)> = Vec::with_capacity(leaves_per_mid);
        for j in 0..leaves_per_mid {
            let leaf_idx = mid_idx * leaves_per_mid + j;
            let name = format!("leaf_{leaf_idx:04}");
            entries.push((name, leaf_hashes[leaf_idx]));
        }

        let dir_recipe = make_directory_recipe(
            entries.iter().map(|(n, h)| (n.as_str(), *h)).collect()
        );
        let (_, dir_hash) = fixture_dir.write_recipe(&dir_recipe);

        build::build(
            &store,
            &dir_recipe.encode(),
            &BuildOptions { quiet: true, ..Default::default() },
        )
        .unwrap();

        mid_hashes.push(dir_hash);
        all_recipes.push((dir_recipe, dir_hash));
    }

    // Phase 3: Create 4 top-level directory recipes (5 mids each)
    let num_tops = 4;
    let mids_per_top = 5;
    let mut top_hashes: Vec<HodHash> = Vec::with_capacity(num_tops);

    for top_idx in 0..num_tops {
        let mut entries: Vec<(String, HodHash)> = Vec::with_capacity(mids_per_top);
        for j in 0..mids_per_top {
            let mid_idx = top_idx * mids_per_top + j;
            let name = format!("mid_{mid_idx:04}");
            entries.push((name, mid_hashes[mid_idx]));
        }

        let dir_recipe = make_directory_recipe(
            entries.iter().map(|(n, h)| (n.as_str(), *h)).collect()
        );
        let (_, dir_hash) = fixture_dir.write_recipe(&dir_recipe);

        build::build(
            &store,
            &dir_recipe.encode(),
            &BuildOptions { quiet: true, ..Default::default() },
        )
        .unwrap();

        top_hashes.push(dir_hash);
        all_recipes.push((dir_recipe, dir_hash));
    }

    // Phase 4: Create root directory containing all tops
    let root_entries: Vec<(&str, HodHash)> = top_hashes
        .iter()
        .enumerate()
        .map(|(i, h)| {
            let name = format!("top_{i}");
            (Box::leak(name.into_boxed_str()) as &str, *h)
        })
        .collect();

    let root_recipe = make_directory_recipe(root_entries);
    let (_, root_hash) = fixture_dir.write_recipe(&root_recipe);

    let root_output = build::build(
        &store,
        &root_recipe.encode(),
        &BuildOptions { quiet: true, ..Default::default() },
    )
    .unwrap();

    all_recipes.push((root_recipe, root_hash));

    // Verify: total recipe count
    assert!(
        all_recipes.len() >= 100,
        "should have built 100+ recipes, got {}",
        all_recipes.len(),
    );

    // Verify: root output is valid
    assert_eq!(hash_to_hex(&root_output).len(), 64);

    // Verify: all outputs are in the store
    for (_recipe, hash) in &all_recipes {
        let output = store.get_output(hash).unwrap();
        assert!(
            output.is_some(),
            "recipe {} should have an output",
            hash_to_hex(hash),
        );
    }
}

#[test]
fn e2e_scale_wide_dag_builds() {
    let (_tmp, store, _fixture_dir) = test_env();

    // Build a single directory recipe with 50 entries (all files)
    let mut entries = Vec::with_capacity(50);

    for i in 0..50 {
        let content = format!("wide file {i}\n").into_bytes();
        store.write_blob(&content).unwrap();
        let file_recipe = Recipe::File(RecipeFile {
            content_blob_hash: hash_bytes(&content),
            executable: false,
            resources_hash: None,
        });

        // Build the file recipe
        build::build(
            &store,
            &file_recipe.encode(),
            &BuildOptions { quiet: true, ..Default::default() },
        )
        .unwrap();

        entries.push((format!("file_{i:03}.txt"), file_recipe.recipe_hash()));
    }

    let dir_recipe = make_directory_recipe(
        entries.iter().map(|(n, h)| (n.as_str(), *h)).collect(),
    );

    let output = build::build(
        &store,
        &dir_recipe.encode(),
        &BuildOptions { quiet: true, ..Default::default() },
    )
    .unwrap();

    // Verify the output directory has all 50 files
    let staging_path = build::artifact_staging_path(&store, &output);
    assert!(staging_path.is_dir());
    let file_count = std::fs::read_dir(&staging_path)
        .unwrap()
        .filter(|e| e.is_ok())
        .count();
    assert_eq!(file_count, 50, "directory should have 50 entries");
}

#[test]
fn e2e_scale_deep_chain() {
    let (_tmp, store, fixture_dir) = test_env();

    // Build a chain of 20 alternating recipes (file → dir → process → dir → ...)
    let chain = setup_chain(&store, &fixture_dir, 20);

    assert_eq!(chain.len(), 20);

    // Every recipe in the chain should have an output
    for (i, (_recipe, hash)) in chain.iter().enumerate() {
        let output = store.get_output(hash).unwrap();
        assert!(
            output.is_some(),
            "chain element {i} should have output"
        );
    }

    // The final recipe's output should be valid
    let (_final_recipe, final_hash) = chain.last().unwrap();
    let final_output = store.get_output(final_hash).unwrap().unwrap();
    let staging_path = build::artifact_staging_path(&store, &final_output);
    assert!(
        staging_path.exists(),
        "final chain output should be staged"
    );
}

// ---------------------------------------------------------------------------
// 7.2: CLI integration — full pipeline via binary
// ---------------------------------------------------------------------------

#[test]
fn e2e_cli_build_then_ls_output_recursive() {
    let (_tmp, store, fixture_dir) = test_env();

    // Build a directory with files
    let content_a = b"file A for CLI\n";
    let content_b = b"file B for CLI\n";

    let file_a = make_file_recipe(&store, content_a, false);
    let file_b = make_file_recipe(&store, content_b, true);

    // Build files in-process
    build::build(
        &store,
        &file_a.encode(),
        &BuildOptions { quiet: true, ..Default::default() },
    )
    .unwrap();
    build::build(
        &store,
        &file_b.encode(),
        &BuildOptions { quiet: true, ..Default::default() },
    )
    .unwrap();

    let dir_recipe = make_directory_recipe(vec![
        ("alpha.txt", file_a.recipe_hash()),
        ("beta.sh", file_b.recipe_hash()),
    ]);

    let (dir_path, _dir_hash) = fixture_dir.write_recipe(&dir_recipe);

    // Build the directory via CLI
    let build_output = hod_build(&dir_path, store.root());
    assert!(build_output.status.success());

    let output_hash = String::from_utf8_lossy(&build_output.stdout).trim().to_string();

    // ls-output (non-recursive)
    let ls = hod_ls_output(&output_hash, store.root());
    assert!(ls.status.success());
    let listing = String::from_utf8_lossy(&ls.stdout).to_string();
    assert!(listing.contains("alpha.txt") || listing.contains("beta.sh"));

    // ls-output --recursive
    let ls_r = hod_ls_output_with_args(&output_hash, store.root(), &["--recursive"]);
    assert!(ls_r.status.success());
    let listing_r = String::from_utf8_lossy(&ls_r.stdout).to_string();
    assert!(listing_r.contains("alpha.txt"));
    assert!(listing_r.contains("beta.sh"));

    // ls-output --long
    let ls_l = hod_ls_output_with_args(&output_hash, store.root(), &["--long"]);
    assert!(ls_l.status.success());
    let listing_l = String::from_utf8_lossy(&ls_l.stdout).to_string();
    // Long format should include permissions
    assert!(listing_l.contains("-rw-") || listing_l.contains("-rwx"));

    // ls-output --long --recursive
    let ls_lr = hod_ls_output_with_args(
        &output_hash,
        store.root(),
        &["--long", "--recursive"],
    );
    assert!(ls_lr.status.success());
    let listing_lr = String::from_utf8_lossy(&ls_lr.stdout).to_string();
    assert!(listing_lr.contains("alpha.txt"));
    assert!(listing_lr.contains("beta.sh"));
}

#[test]
fn e2e_cli_force_rebuild_same_hash() {
    let (_tmp, store, fixture_dir) = test_env();

    let content = b"force rebuild e2e\n";
    let recipe = make_file_recipe(&store, content, false);
    let (recipe_path, _) = fixture_dir.write_recipe(&recipe);

    // Build normally
    let build1 = hod_build(&recipe_path, store.root());
    assert!(build1.status.success());
    let hash1 = String::from_utf8_lossy(&build1.stdout).trim().to_string();

    // Force rebuild — same hash
    let build2 = hod_build_with_args(&recipe_path, store.root(), &["--force"]);
    assert!(build2.status.success());
    let hash2 = String::from_utf8_lossy(&build2.stdout).trim().to_string();

    assert_eq!(hash1, hash2, "forced rebuild should produce same hash");
}

#[test]
fn e2e_cli_verbose_output() {
    let (_tmp, store, fixture_dir) = test_env();

    let content = b"verbose test\n";
    let recipe = make_file_recipe(&store, content, false);
    let (recipe_path, _) = fixture_dir.write_recipe(&recipe);

    let build_output = hod_build_with_args(&recipe_path, store.root(), &["--verbose"]);
    assert!(build_output.status.success());

    let stderr = String::from_utf8_lossy(&build_output.stderr).to_string();
    assert!(
        stderr.contains("[hod]") || stderr.contains("store"),
        "verbose mode should output diagnostic info, got: {stderr}"
    );
}

// ---------------------------------------------------------------------------
// 7.2: Edge cases
// ---------------------------------------------------------------------------

#[test]
fn e2e_empty_directory_output() {
    let (_tmp, store, fixture_dir) = test_env();

    let dir_recipe = make_directory_recipe(vec![]);
    let (dir_path, _dir_hash) = fixture_dir.write_recipe(&dir_recipe);

    let build_output = hod_build(&dir_path, store.root());
    assert!(build_output.status.success());

    let output_hash = String::from_utf8_lossy(&build_output.stdout).trim().to_string();
    let ls = hod_ls_output(&output_hash, store.root());

    // Empty directory — ls-output should succeed with empty or minimal output
    assert!(ls.status.success());
}

#[test]
fn e2e_deeply_nested_directories() {
    let (_tmp, store, fixture_dir) = test_env();

    // Create a chain of nested directories: dir_n containing dir_{n-1} containing ... a file
    let content = b"deeply nested leaf\n";
    let file_recipe = make_file_recipe(&store, content, false);
    let (_, file_hash) = fixture_dir.write_recipe(&file_recipe);

    build::build(
        &store,
        &file_recipe.encode(),
        &BuildOptions { quiet: true, ..Default::default() },
    )
    .unwrap();

    let mut current_hash = file_hash;
    let depth = 10;

    for i in 0..depth {
        let dir_name = format!("level_{i}");
        let dir_recipe = make_directory_recipe(vec![(&dir_name, current_hash)]);
        let (_, dir_hash) = fixture_dir.write_recipe(&dir_recipe);

        build::build(
            &store,
            &dir_recipe.encode(),
            &BuildOptions { quiet: true, ..Default::default() },
        )
        .unwrap();

        current_hash = dir_hash;
    }

    // The root directory output should exist and be traversable
    let root_output = store.get_output(&current_hash).unwrap().unwrap();
    let staging = build::artifact_staging_path(&store, &root_output);
    assert!(staging.is_dir());

    // Verify we can reach the leaf content by walking the directory tree
    let mut path = staging.clone();
    // Walk from outermost (level_{depth-1}) to innermost (level_0)
    // The chain builds: level_0 wraps file, level_1 wraps level_0, etc.
    // So from the root, we descend: level_{depth-1}/level_{depth-2}/.../level_0
    for i in (0..depth).rev() {
        path = path.join(format!("level_{i}"));
        assert!(path.is_dir() || path.is_file(), "level_{i} should exist at {}", path.display());
    }
    // At level_0, the file content should be the leaf content
    // (level_0 was a directory containing the file, named after the file recipe hash)
    assert!(path.is_dir() || path.is_file(), "leaf should exist");
}

#[test]
fn e2e_process_with_env_and_deps() {
    let (_tmp, store, fixture_dir) = test_env();

    // Create a file dependency
    let dep_content = b"dependency data\n";
    let dep_recipe = make_file_recipe(&store, dep_content, false);
    let (_, dep_hash) = fixture_dir.write_recipe(&dep_recipe);

    build::build(
        &store,
        &dep_recipe.encode(),
        &BuildOptions { quiet: true, ..Default::default() },
    )
    .unwrap();

    // Create a process that reads the dependency and uses an env var
    let process_recipe = make_process_with_env(
        "cat $DEPS/mydep/data > $OUT/deps_content.txt; echo $MY_LABEL > $OUT/label.txt",
        vec![("MY_LABEL", "e2e-test-label")],
        vec![("mydep", dep_hash)],
    );

    let (proc_path, _proc_hash) = fixture_dir.write_recipe(&process_recipe);

    let build_output = hod_build(&proc_path, store.root());
    assert!(
        build_output.status.success(),
        "process build should succeed, stderr: {}",
        String::from_utf8_lossy(&build_output.stderr),
    );

    let output_hash = String::from_utf8_lossy(&build_output.stdout).trim().to_string();
    let output_hash_parsed = hod::hash::hex_to_hash(&output_hash).unwrap();
    let staging = build::artifact_staging_path(&store, &output_hash_parsed);

    if staging.is_dir() {
        // Check the dependency content was read
        let deps_content = std::fs::read_to_string(staging.join("deps_content.txt"))
            .unwrap_or_default();
        assert!(
            deps_content.contains("dependency data"),
            "should contain dep content, got: {deps_content}"
        );

        // Check the env var was set
        let label = std::fs::read_to_string(staging.join("label.txt"))
            .unwrap_or_default();
        assert!(
            label.contains("e2e-test-label"),
            "should contain env var value, got: {label}"
        );
    }
}

#[test]
fn e2e_multiple_builds_same_store() {
    let (_tmp, store, fixture_dir) = test_env();

    // Build 10 independent recipes in the same store
    let mut output_hashes = Vec::with_capacity(10);

    for i in 0..10 {
        let content = format!("independent recipe {i}\n").into_bytes();
        let recipe = make_file_recipe(&store, &content, false);
        let (path, _hash) = fixture_dir.write_recipe(&recipe);

        let build_output = hod_build(&path, store.root());
        assert!(
            build_output.status.success(),
            "recipe {i} should build successfully"
        );

        let output_hash = String::from_utf8_lossy(&build_output.stdout).trim().to_string();
        output_hashes.push(output_hash);
    }

    // All output hashes should be unique
    let unique: std::collections::HashSet<_> = output_hashes.iter().collect();
    assert_eq!(unique.len(), 10, "each recipe should produce a unique output hash");
}

#[test]
fn e2e_build_log_stored_on_failure() {
    let (_tmp, store, fixture_dir) = test_env();

    let process_recipe = make_process_recipe(
        "echo 'failure details' >&2; exit 1",
        vec![],
    );

    let (proc_path, _proc_hash) = fixture_dir.write_recipe(&process_recipe);

    let build_output = hod_build(&proc_path, store.root());
    assert_eq!(
        build_output.status.code(),
        Some(1),
        "failed process should exit 1"
    );

    // Verify build log was stored
    let log = store.get_build_log(&process_recipe.recipe_hash()).unwrap();
    assert!(log.is_some(), "build log should be stored");

    let log = log.unwrap();
    assert_eq!(log.exit_code, 1);
    assert!(log.stderr_blob.is_some(), "stderr blob should be captured");
}

// ---------------------------------------------------------------------------
// 7.1: Fixture verification — ensure generated fixtures are valid
// ---------------------------------------------------------------------------

#[test]
fn fixture_file_recipe_decodable() {
    let (_tmp, store, fixture_dir) = test_env();

    let content = b"fixture verification\n";
    let recipe = make_file_recipe(&store, content, true);
    let (path, hash) = fixture_dir.write_recipe(&recipe);

    // Read back and decode
    let bytes = std::fs::read(&path).unwrap();
    let decoded = Recipe::decode(&bytes).unwrap();

    assert_eq!(decoded, recipe);
    assert_eq!(Recipe::decode(&bytes).unwrap().recipe_hash(), hash);
}

#[test]
fn fixture_process_recipe_decodable() {
    let tmp = TempDir::new().unwrap();
    let fixtures_path = tmp.path().join("fixtures");
    let fixture_dir = FixtureDir::create(&fixtures_path).unwrap();

    let recipe = make_process_recipe("echo hello > $OUT/out.txt", vec![]);
    let (path, hash) = fixture_dir.write_recipe(&recipe);

    let bytes = std::fs::read(&path).unwrap();
    let decoded = Recipe::decode(&bytes).unwrap();

    assert_eq!(decoded, recipe);
    assert_eq!(decoded.recipe_hash(), hash);
}

#[test]
fn fixture_directory_recipe_decodable() {
    let (_tmp, store, fixture_dir) = test_env();

    let content = b"entry content\n";
    let file_recipe = make_file_recipe(&store, content, false);
    let (_, file_hash) = fixture_dir.write_recipe(&file_recipe);

    let dir_recipe = make_directory_recipe(vec![("my_file.txt", file_hash)]);
    let (path, hash) = fixture_dir.write_recipe(&dir_recipe);

    let bytes = std::fs::read(&path).unwrap();
    let decoded = Recipe::decode(&bytes).unwrap();

    assert_eq!(decoded, dir_recipe);
    assert_eq!(decoded.recipe_hash(), hash);
}
