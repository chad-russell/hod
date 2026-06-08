//! System profile tests.
//!
//! These exercise the core generation lifecycle without evaluating TypeScript
//! profiles or running builds. The fake package output is registered directly
//! in a temp store, then `hod::system` materializes generations from it.

use hod::build::artifact_staging_path;
use hod::hash::{hash_bytes, Hash};
use hod::profile::ProfilePackage;
use hod::recipe::{Recipe, RecipeFile};
use hod::store::Store;
use tempfile::TempDir;

fn open_tmp_store() -> (TempDir, Store) {
    let tmp = TempDir::new().expect("create temp dir");
    let store = Store::open_at(tmp.path()).expect("open store");
    (tmp, store)
}

fn set_system_env(system_dir: &std::path::Path, roots_dir: &std::path::Path) {
    std::env::set_var("HOD_SYSTEM_DIR", system_dir);
    std::env::set_var("HOD_ROOTS_DIR", roots_dir);
}

fn fake_built_package(store: &Store, name: &str) -> ProfilePackage {
    let blob_hash = store
        .write_blob(format!("fake package {name}\n").as_bytes())
        .expect("write blob");
    let recipe = Recipe::File(RecipeFile {
        content_blob_hash: blob_hash,
        executable: false,
        resources_hash: None,
    });
    let recipe_hash = store.store_recipe(&recipe.encode()).expect("store recipe");
    let output_hash: Hash = hash_bytes(format!("fake output {name}").as_bytes());

    let staging = artifact_staging_path(store, &output_hash);
    std::fs::create_dir_all(staging.join("bin")).expect("create staging bin");
    std::fs::write(staging.join("bin").join(name), b"#!/bin/sh\n").expect("write fake bin");
    store
        .store_output(&recipe_hash, &output_hash, 1, None)
        .expect("record output");

    ProfilePackage {
        name: Some(name.to_string()),
        hash: recipe_hash,
    }
}

#[test]
fn build_activate_list_and_rollback_generations() {
    let (_store_tmp, store) = open_tmp_store();
    let system_tmp = TempDir::new().expect("system dir");
    let roots_tmp = TempDir::new().expect("roots dir");
    set_system_env(system_tmp.path(), roots_tmp.path());

    let pkg_a = fake_built_package(&store, "alpha");
    let (gen1, gen1_dir) =
        hod::system::build_generation(&store, "test-system-a", std::slice::from_ref(&pkg_a), None)
            .expect("build generation 1");
    assert_eq!(gen1, 1);
    assert!(gen1_dir.join("pkgs/alpha").is_symlink());
    assert!(gen1_dir.join("runtime").is_dir());
    assert!(gen1_dir.join("metadata.json").is_file());

    hod::system::activate_generation(gen1, "test-system-a", &[pkg_a.hash])
        .expect("activate generation 1");
    let current = std::fs::read_link(system_tmp.path().join("current")).expect("read current");
    assert_eq!(current, std::path::PathBuf::from("generations/1"));

    let pkg_b = fake_built_package(&store, "beta");
    let (gen2, gen2_dir) =
        hod::system::build_generation(&store, "test-system-b", std::slice::from_ref(&pkg_b), None)
            .expect("build generation 2");
    assert_eq!(gen2, 2);
    assert!(gen2_dir.join("pkgs/beta").is_symlink());
    hod::system::activate_generation(gen2, "test-system-b", &[pkg_b.hash])
        .expect("activate generation 2");

    let listed = hod::system::list_generations().expect("list generations");
    assert_eq!(listed.len(), 2);
    assert_eq!(listed[0].generation, 1);
    assert_eq!(listed[1].generation, 2);
    assert!(!listed[0].is_current);
    assert!(listed[1].is_current);

    let roots = std::fs::read_to_string(roots_tmp.path().join("system-current.txt"))
        .expect("read system roots");
    assert!(roots.contains("# hod roots: system profile test-system-b"));

    let rolled_to = hod::system::rollback().expect("rollback");
    assert_eq!(rolled_to, 1);
    let current = std::fs::read_link(system_tmp.path().join("current")).expect("read current");
    assert_eq!(current, std::path::PathBuf::from("generations/1"));
}

#[test]
fn unpin_reports_whether_roots_existed() {
    let system_tmp = TempDir::new().expect("system dir");
    let roots_tmp = TempDir::new().expect("roots dir");
    set_system_env(system_tmp.path(), roots_tmp.path());

    assert!(!hod::system::remove_system_roots().expect("remove absent roots"));
    hod::system::write_system_roots("test", &[[0xAB; 32]]).expect("write roots");
    assert!(hod::system::remove_system_roots().expect("remove present roots"));
    assert!(!roots_tmp.path().join("system-current.txt").exists());
}
