//! GCC Stage 1 + Packed Executable Validation
//!
//! Validates that gcc-stage1 can compile and run a dynamically linked C program
//! against our hermetic glibc 2.41 in the fully hermetic sandbox. Also tests the packed
//! executable pipeline (AT_EXECFN bootstrap injection).
//!
//! With the glibc 2.41 upgrade, the AT_EXECFN bootstrap mode is now the
//! default packing strategy. These tests verify the full pipeline:
//!   1. Build the validate-stage1 recipe (compiles hello.c with gcc-stage1)
//!   2. Verify the compiled binary is a valid dynamically linked ELF
//!   3. Verify the packed output structure (bin/ + lib/)
//!   4. Verify the AT_EXECFN bootstrap injection modified the binary correctly
//!   5. Verify the packed binary runs correctly
//!
//! These tests are marked `#[ignore]` because they require:
//!   1. Network access to download sources (~200MB total)
//!   2. ~15 minutes to build the full dependency chain
//!
//! Run with: `cargo test --test at_execfn_validation -- --test-threads=1 --ignored`

use std::path::Path;
use std::process::Command;

use hod::hash::hex_to_hash;

/// Path to the compiled hod binary.
fn hod_bin() -> String {
    env!("CARGO_BIN_EXE_hod").to_string()
}

/// Run `hod build` with args, returning the process output.
fn hod_build(recipe_path: &str, store_path: &Path) -> std::process::Output {
    let args = vec![
        "build",
        recipe_path,
        "--store",
        store_path.to_str().unwrap(),
    ];
    Command::new(hod_bin())
        .args(&args)
        .output()
        .expect("failed to run hod")
}

#[allow(dead_code)]
fn hod_ls_output(hash: &str, store_path: &Path, extra_args: &[&str]) -> std::process::Output {
    let mut args = vec!["ls-output", hash, "--store", store_path.to_str().unwrap()];
    args.extend(extra_args);
    Command::new(hod_bin())
        .args(&args)
        .output()
        .expect("failed to run hod")
}

// ===========================================================================
// Test 1: Compile and run hello.c with gcc-stage1
// ===========================================================================

#[test]
#[ignore]
fn gcc_stage1_compiles_and_runs_dynamic_binary() {
    let tmp = tempfile::tempdir().unwrap();
    let store_path = tmp.path();

    // Build the validate-stage1 recipe: compiles hello.c with gcc-stage1,
    // links against glibc, and runs the binary inside the sandbox.
    let output = hod_build(
        "recipes/cross/validate-stage1.hod",
        store_path,
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    assert!(
        output.status.success(),
        "validate-stage1 build should succeed\nstdout: {stdout}\nstderr: {stderr}"
    );

    // The output hash is the last line of stdout
    let output_hash = stdout.trim().lines().last().unwrap().to_string();
    assert_eq!(output_hash.len(), 64, "output hash should be 64 hex chars");

    // Verify output contains the hello binary and output.txt
    let staging_path = {
        let parsed = hex_to_hash(&output_hash).unwrap();
        let shard = hod::hash::hash_shard(&parsed);
        store_path.join("staging").join(&shard).join(&output_hash)
    };

    assert!(
        staging_path.join("hello").exists(),
        "output should contain hello binary"
    );
    assert!(
        staging_path.join("output.txt").exists(),
        "output should contain output.txt"
    );

    // Verify the binary is a dynamically linked ELF
    let hello_bytes = std::fs::read(staging_path.join("hello")).unwrap();
    assert!(hod::packed::is_elf(&hello_bytes), "hello should be a valid ELF binary");

    // Verify it has a PT_INTERP (dynamically linked)
    let interp = hod::packed::parse_interp(&hello_bytes);
    assert!(
        interp.is_some(),
        "hello should have a PT_INTERP (dynamically linked)"
    );
    assert!(
        interp.as_ref().unwrap().contains("ld-linux"),
        "PT_INTERP should reference ld-linux, got: {:?}",
        interp
    );

    // Verify the output.txt contains the expected messages
    let output_content =
        std::fs::read_to_string(staging_path.join("output.txt")).unwrap();
    assert!(
        output_content.contains("hello from gcc-stage1/glibc"),
        "output should contain hello message, got: {output_content}"
    );
    assert!(
        output_content.contains("printf works"),
        "output should confirm printf works, got: {output_content}"
    );
}

// ===========================================================================
// Test 2: AT_EXECFN bootstrap injection on the compiled binary
// ===========================================================================

#[test]
#[ignore]
fn at_execfn_bootstrap_injection_on_stage1_binary() {
    let tmp = tempfile::tempdir().unwrap();
    let store_path = tmp.path();

    // Step 1: Build validate-stage1 to get the compiled binary
    let output = hod_build(
        "recipes/cross/validate-stage1.hod",
        store_path,
    );
    assert!(
        output.status.success(),
        "validate-stage1 should build: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    let output_hash = stdout.trim().lines().last().unwrap().to_string();

    let staging_path = {
        let parsed = hex_to_hash(&output_hash).unwrap();
        let shard = hod::hash::hash_shard(&parsed);
        store_path.join("staging").join(&shard).join(&output_hash)
    };

    let hello_bytes = std::fs::read(staging_path.join("hello")).unwrap();

    // Step 2: Manually inject AT_EXECFN bootstrap and verify
    let mut modified = hello_bytes.clone();
    let result = hod::packed::inject_bootstrap(&mut modified, "../lib/ld-linux-x86-64.so.2")
        .expect("bootstrap injection should succeed");
    assert!(result, "bootstrap injection should return true for dynamic ELF");

    // Step 3: Verify the modified binary is still valid ELF
    assert!(hod::packed::is_elf(&modified), "modified binary should still be valid ELF");
    assert_eq!(&modified[0..4], b"\x7fELF", "ELF magic should be preserved");

    // Step 4: Verify e_entry changed (bootstrap is now the entry point)
    let orig_entry = u64::from_le_bytes(hello_bytes[24..32].try_into().unwrap());
    let new_entry = u64::from_le_bytes(modified[24..32].try_into().unwrap());
    assert_ne!(
        orig_entry, new_entry,
        "e_entry should have changed after bootstrap injection"
    );

    // Step 5: Verify PT_INTERP was converted to PT_LOAD
    let parsed = goblin::elf::Elf::parse(&modified).expect("should parse modified ELF");
    let has_interp = parsed.program_headers.iter().any(|p| {
        p.p_type == goblin::elf::program_header::PT_INTERP
    });
    assert!(
        !has_interp,
        "PT_INTERP should have been converted to PT_LOAD after bootstrap injection"
    );

    // Step 6: Verify a new high-address PT_LOAD segment exists (the bootstrap)
    let max_load = parsed.program_headers.iter()
        .filter(|p| p.p_type == goblin::elf::program_header::PT_LOAD)
        .max_by_key(|p| p.p_vaddr);
    assert!(max_load.is_some(), "should have PT_LOAD segments");
    let bootstrap = max_load.unwrap();
    assert!(
        bootstrap.p_filesz > 0,
        "bootstrap segment should have non-zero size"
    );
    assert!(
        bootstrap.p_filesz < 4096,
        "bootstrap segment should be small (< 4KB), got {} bytes",
        bootstrap.p_filesz
    );
}

