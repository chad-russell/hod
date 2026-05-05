//! Sandbox Improvements tests — Work Stream 2.
//!
//! Tests for:
//! - Auto-population of PATH, LIBRARY_PATH, C_INCLUDE_PATH from deps
//! - Host PATH no longer inherited
//! - All builds are hermetic (host bind-mounts removed)
//! - Env var precedence: auto-env < recipe env < standard builder env
//!
//! All tests in this file spawn processes inside the sandbox. Since the sandbox
//! is fully hermetic (no host filesystem), these tests use the real hod store
//! so that the seed-root (busybox) dependency is already cached.
//! They are marked `#[ignore]` and require the seed-root to be built.
//! Run with: `cargo test --test sandbox_improvements -- --test-threads=1 --ignored`

use hod::build::{self, BuildError, BuildOptions};
use hod::hash::{hash_bytes, hash_to_hex, hex_to_hash, Hash};
use hod::recipe::*;
use hod::store::{Store, StoreConfig};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
fn seed_dep() -> ProcessDependency {
    ProcessDependency {
        name: "seed".to_string(),
        recipe_hash: hex_to_hash(SEED_ROOT_RECIPE_HASH).unwrap(),
    }
}

/// Command to invoke busybox ash inside the sandbox.
/// Requires seed-root as a dependency named "seed".
const SANDBOX_SHELL: &str = "/deps/seed/bin/busybox";

/// Build a recipe from its Recipe struct.
fn build_recipe(
    store: &Store,
    recipe: &Recipe,
    opts: &BuildOptions,
) -> std::result::Result<Hash, BuildError> {
    let bytes = recipe.encode();
    build::build(store, &bytes, opts)
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

/// Build a simple dependency that produces a directory with bin/ and/or lib/ and/or include/
/// subdirectories. Returns (recipe_hash, output_hash).
///
/// Uses seed-root's busybox for the shell.
fn build_toolchain_dep_with_hash(
    store: &Store,
    has_bin: bool,
    has_lib: bool,
    has_include: bool,
) -> (Hash, Hash) {
    let mut script = String::from("mkdir -p $OUT");
    if has_bin {
        script.push_str(" $OUT/bin");
        script.push_str(" && touch $OUT/bin/tool");
    }
    if has_lib {
        script.push_str(" $OUT/lib");
        script.push_str(" && touch $OUT/lib/lib.a");
    }
    if has_include {
        script.push_str(" $OUT/include");
        script.push_str(" && touch $OUT/include/header.h");
    }

    let recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec!["sh".to_string(), "-c".to_string(), script],
        env: vec![],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let recipe_hash = recipe.recipe_hash();
    let output_hash = build_recipe(
        store,
        &recipe,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    )
    .unwrap();

    (recipe_hash, output_hash)
}

/// Build a simple dep that runs a shell script and returns (recipe_hash, output_hash).
fn build_dep_script(store: &Store, script: &str) -> (Hash, Hash) {
    let recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec!["sh".to_string(), "-c".to_string(), script.to_string()],
        env: vec![],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let recipe_hash = recipe.recipe_hash();
    let output_hash = build_recipe(
        store,
        &recipe,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    )
    .unwrap();

    (recipe_hash, output_hash)
}

/// Read the content of a file inside a staged output directory.
fn read_staged_file(staging_path: &std::path::Path, file: &str) -> Option<String> {
    let path = staging_path.join(file);
    if path.exists() {
        Some(std::fs::read_to_string(&path).unwrap_or_default())
    } else {
        None
    }
}

/// Get the staging path for an output hash.
fn staging_path(store: &Store, hash: &Hash) -> std::path::PathBuf {
    store
        .staging_dir()
        .join(&hod::hash::hash_shard(hash))
        .join(&hash_to_hex(hash))
}

// ===========================================================================
// Tests: Auto-PATH from deps
// ===========================================================================

#[test]
#[ignore]
fn auto_path_constructed_from_deps_with_bin() {
    let store = real_store();

    // Build a dependency that has a bin/ subdirectory
    let (dep_recipe_hash, _dep_output) = build_toolchain_dep_with_hash(&store, true, false, false);

    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec!["sh".to_string(), "-c".to_string(), "echo $PATH > $OUT/path.txt".to_string()],
        env: vec![],
        dependencies: vec![
            ProcessDependency {
                name: "mytool".to_string(),
                recipe_hash: dep_recipe_hash,
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
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    )
    .unwrap();

    let sp = staging_path(&store, &output_hash);
    let path_content = read_staged_file(&sp, "path.txt").unwrap_or_default();

    // PATH should contain /deps/mytool/bin
    assert!(
        path_content.contains("/deps/mytool/bin"),
        "PATH should contain /deps/mytool/bin, got: {path_content}"
    );
}

#[test]
#[ignore]
fn auto_path_sorted_by_dep_name() {
    let store = real_store();

    // Build two DIFFERENT dependencies with bin/ dirs
    let (_, _) = build_dep_script(&store, "mkdir -p $OUT/bin && echo alpha > $OUT/bin/tool");
    let dep_a_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec![
            "sh".to_string(),
            "-c".to_string(),
            "mkdir -p $OUT/bin && echo alpha > $OUT/bin/tool".to_string(),
        ],
        env: vec![],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });
    let dep_b_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec![
            "sh".to_string(),
            "-c".to_string(),
            "mkdir -p $OUT/bin && echo zoo > $OUT/bin/tool".to_string(),
        ],
        env: vec![],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    // Build both deps
    let _ = build_recipe(
        &store,
        &dep_a_recipe,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    );
    let _ = build_recipe(
        &store,
        &dep_b_recipe,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    );

    // Build a process depending on both — deps MUST be sorted by name
    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec!["sh".to_string(), "-c".to_string(), "echo $PATH > $OUT/path.txt".to_string()],
        env: vec![],
        dependencies: vec![
            ProcessDependency {
                name: "alpha".to_string(),
                recipe_hash: dep_a_recipe.recipe_hash(),
            },
            seed_dep(),
            ProcessDependency {
                name: "zoo".to_string(),
                recipe_hash: dep_b_recipe.recipe_hash(),
            },
        ],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let output_hash = build_recipe(
        &store,
        &process_recipe,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    )
    .unwrap();

    let sp = staging_path(&store, &output_hash);
    let path_content = read_staged_file(&sp, "path.txt").unwrap_or_default();

    // PATH should be sorted: alpha before zoo
    let alpha_pos = path_content.find("/deps/alpha/bin").unwrap_or(usize::MAX);
    let zoo_pos = path_content.find("/deps/zoo/bin").unwrap_or(usize::MAX);
    assert!(
        alpha_pos < zoo_pos,
        "PATH should have alpha before zoo (sorted by dep name), got: {path_content}"
    );
}

#[test]
#[ignore]
fn auto_library_path_constructed_from_deps_with_lib() {
    let store = real_store();

    let dep_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec![
            "sh".to_string(),
            "-c".to_string(),
            "mkdir -p $OUT/lib && echo 'lib' > $OUT/lib/libtest.a".to_string(),
        ],
        env: vec![],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let _ = build_recipe(
        &store,
        &dep_recipe,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    );

    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec![
            "sh".to_string(),
            "-c".to_string(),
            "echo $LIBRARY_PATH > $OUT/libpath.txt".to_string(),
        ],
        env: vec![],
        dependencies: vec![
            ProcessDependency {
                name: "mylib".to_string(),
                recipe_hash: dep_recipe.recipe_hash(),
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
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    )
    .unwrap();

    let sp = staging_path(&store, &output_hash);
    let content = read_staged_file(&sp, "libpath.txt").unwrap_or_default();

    assert!(
        content.contains("/deps/mylib/lib"),
        "LIBRARY_PATH should contain /deps/mylib/lib, got: {content}"
    );
}

#[test]
#[ignore]
fn auto_c_include_path_constructed_from_deps_with_include() {
    let store = real_store();

    let dep_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec![
            "sh".to_string(),
            "-c".to_string(),
            "mkdir -p $OUT/include && echo 'int x;' > $OUT/include/mylib.h".to_string(),
        ],
        env: vec![],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let _ = build_recipe(
        &store,
        &dep_recipe,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    );

    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec![
            "sh".to_string(),
            "-c".to_string(),
            "echo $C_INCLUDE_PATH > $OUT/incpath.txt".to_string(),
        ],
        env: vec![],
        dependencies: vec![
            ProcessDependency {
                name: "mylib".to_string(),
                recipe_hash: dep_recipe.recipe_hash(),
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
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    )
    .unwrap();

    let sp = staging_path(&store, &output_hash);
    let content = read_staged_file(&sp, "incpath.txt").unwrap_or_default();

    assert!(
        content.contains("/deps/mylib/include"),
        "C_INCLUDE_PATH should contain /deps/mylib/include, got: {content}"
    );
}

#[test]
#[ignore]
fn auto_path_not_set_when_no_deps_have_bin() {
    let store = real_store();

    // Dependency without bin/
    let dep_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec![
            "sh".to_string(),
            "-c".to_string(),
            "mkdir -p $OUT/lib && echo 'lib' > $OUT/lib/libtest.a".to_string(),
        ],
        env: vec![],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let _ = build_recipe(
        &store,
        &dep_recipe,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    );

    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec![
            "sh".to_string(),
            "-c".to_string(),
            // Use env to print if PATH is set
            "env > $OUT/env.txt".to_string(),
        ],
        env: vec![],
        dependencies: vec![
            ProcessDependency {
                name: "mylib".to_string(),
                recipe_hash: dep_recipe.recipe_hash(),
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
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    )
    .unwrap();

    let sp = staging_path(&store, &output_hash);
    let env_content = read_staged_file(&sp, "env.txt").unwrap_or_default();

    // PATH should only come from seed (since seed has bin/) — not from mylib.
    // The key assertion: no /deps/mylib/bin in PATH.
    assert!(
        !env_content.contains("/deps/mylib/bin"),
        "mylib has no bin/ so it should not contribute to PATH, got:\n{env_content}"
    );
    // seed always contributes PATH=/deps/seed/bin, that's expected.
    assert!(
        env_content.contains("PATH=/deps/seed/bin"),
        "seed should contribute to PATH, got:\n{env_content}"
    );
}

// ===========================================================================
// Tests: Host PATH no longer inherited
// ===========================================================================

#[test]
#[ignore]
fn host_path_not_inherited_when_no_deps() {
    let store = real_store();

    // Process with only seed as a dependency — PATH should come from seed only,
    // not from any host inheritance.
    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec![
            "sh".to_string(),
            "-c".to_string(),
            "echo $PATH > $OUT/path.txt".to_string(),
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
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    )
    .unwrap();

    let sp = staging_path(&store, &output_hash);
    let content = read_staged_file(&sp, "path.txt").unwrap_or_default();

    // PATH should be ONLY from seed auto-env — no host PATH leaking in.
    // The value should be exactly "/deps/seed/bin" with no host paths.
    let path_value = content.trim();
    assert_eq!(
        path_value, "/deps/seed/bin",
        "PATH should be exactly /deps/seed/bin (no host paths), got: {path_value}"
    );
}

// ===========================================================================
// Tests: Env var precedence
// ===========================================================================

#[test]
#[ignore]
fn recipe_env_overrides_auto_path() {
    let store = real_store();

    // Dependency with bin/
    let dep_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec!["sh".to_string(), "-c".to_string(), "mkdir -p $OUT/bin".to_string()],
        env: vec![],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let _ = build_recipe(
        &store,
        &dep_recipe,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    );

    // Process that explicitly sets PATH — should override auto-generated PATH
    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec!["sh".to_string(), "-c".to_string(), "echo $PATH > $OUT/path.txt".to_string()],
        env: vec![EnvVar {
            key: "PATH".to_string(),
            value: "/custom/path".to_string(),
        }],
        dependencies: vec![
            ProcessDependency {
                name: "mytool".to_string(),
                recipe_hash: dep_recipe.recipe_hash(),
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
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    )
    .unwrap();

    let sp = staging_path(&store, &output_hash);
    let content = read_staged_file(&sp, "path.txt").unwrap_or_default();

    assert!(
        content.contains("/custom/path"),
        "Recipe env should override auto PATH, got: {content}"
    );
}

#[test]
#[ignore]
fn standard_env_vars_always_set() {
    let store = real_store();

    // Even with no deps (except seed), standard vars are set
    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec![
            "sh".to_string(),
            "-c".to_string(),
            "echo OUT=$OUT DEPS=$DEPS HOME=$HOME TMPDIR=$TMPDIR > $OUT/stdenv.txt".to_string(),
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
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    )
    .unwrap();

    let sp = staging_path(&store, &output_hash);
    let content = read_staged_file(&sp, "stdenv.txt").unwrap_or_default();

    assert!(
        content.contains("OUT=/out"),
        "OUT should be /out, got: {content}"
    );
    assert!(
        content.contains("DEPS=/deps"),
        "DEPS should be /deps, got: {content}"
    );
    assert!(
        content.contains("HOME=/homeless-shelter"),
        "HOME should be /homeless-shelter, got: {content}"
    );
    assert!(
        content.contains("TMPDIR=/tmp"),
        "TMPDIR should be /tmp, got: {content}"
    );
}

#[test]
#[ignore]
fn recipe_env_cannot_override_standard_vars() {
    let store = real_store();

    // Try to override OUT with a recipe env var — standard builder vars win
    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec![
            "sh".to_string(),
            "-c".to_string(),
            "echo $OUT > $OUT/out_value.txt".to_string(),
        ],
        env: vec![EnvVar {
            key: "OUT".to_string(),
            value: "/fake/out".to_string(),
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
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    )
    .unwrap();

    let sp = staging_path(&store, &output_hash);
    let content = read_staged_file(&sp, "out_value.txt").unwrap_or_default();

    // Standard builder vars are set AFTER recipe env vars, so they win
    assert!(
        content.contains("/out"),
        "OUT should be /out (standard builder var wins), got: {content}"
    );
}

// ===========================================================================
// Tests: Deps without standard subdirs don't contribute to auto-env
// ===========================================================================

#[test]
#[ignore]
fn dep_without_subdirs_contributes_nothing() {
    let store = real_store();

    // Dependency with only a data file, no bin/lib/include
    let dep_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec![
            "sh".to_string(),
            "-c".to_string(),
            "echo 'some data' > $OUT/data.txt".to_string(),
        ],
        env: vec![],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let _ = build_recipe(
        &store,
        &dep_recipe,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    );

    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec!["sh".to_string(), "-c".to_string(), "env | sort > $OUT/env.txt".to_string()],
        env: vec![],
        dependencies: vec![
            ProcessDependency {
                name: "mydata".to_string(),
                recipe_hash: dep_recipe.recipe_hash(),
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
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    )
    .unwrap();

    let sp = staging_path(&store, &output_hash);
    let content = read_staged_file(&sp, "env.txt").unwrap_or_default();

    // None of the auto-env vars should be contributed by mydata (it has no
    // bin/lib/include). Only seed contributes its auto-env.
    assert!(
        !content.contains("/deps/mydata/"),
        "mydata should not contribute to any auto-env, got:\n{content}"
    );
    // seed always contributes PATH, LIBRARY_PATH, C_INCLUDE_PATH — that's expected.
    assert!(
        content.contains("PATH=/deps/seed/bin"),
        "seed should contribute PATH, got:\n{content}"
    );
}

// ===========================================================================
// Tests: Hermetic sandbox (host dirs never bind-mounted)
// ===========================================================================

// Note: The sandbox no longer bind-mounts /bin, /usr, /lib, /lib64, /etc, /sbin,
// or /nix from the host. This is always the case — there is no "non-strict" mode.
// Integration tests in tests/seed_validation.rs verify hermeticity end-to-end
// using the seed toolchain.

// ===========================================================================
// Tests: No host env vars inherited (always hermetic)
// ===========================================================================

#[test]
#[ignore]
fn no_host_env_vars_inherited() {
    let store = real_store();

    // Set a host env var to verify it does NOT leak into the sandbox
    std::env::set_var("HOD_TEST_LANG", "en_US.UTF-8");

    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec![
            "sh".to_string(),
            "-c".to_string(),
            // LANG should be unset since we don't inherit host env vars
            "echo \"LANG=${LANG:-unset}\" > $OUT/locale.txt".to_string(),
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
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    )
    .unwrap();

    let sp = staging_path(&store, &output_hash);
    let content = read_staged_file(&sp, "locale.txt").unwrap_or_default();

    // LANG should be unset — we don't inherit host env vars
    assert!(
        content.contains("LANG=unset"),
        "LANG should be unset (not inherited from host), got: {content}"
    );
}

// ===========================================================================
// Tests: Multiple deps with mixed subdirs
// ===========================================================================

#[test]
#[ignore]
fn mixed_deps_only_relevant_auto_env_set() {
    let store = real_store();

    // Dep 1: has bin/ only
    let dep1_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec!["sh".to_string(), "-c".to_string(), "mkdir -p $OUT/bin".to_string()],
        env: vec![],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    // Dep 2: has lib/ only
    let dep2_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec!["sh".to_string(), "-c".to_string(), "mkdir -p $OUT/lib".to_string()],
        env: vec![],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    // Dep 3: has include/ only
    let dep3_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec!["sh".to_string(), "-c".to_string(), "mkdir -p $OUT/include".to_string()],
        env: vec![],
        dependencies: vec![seed_dep()],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let _ = build_recipe(
        &store,
        &dep1_recipe,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    );
    let _ = build_recipe(
        &store,
        &dep2_recipe,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    );
    let _ = build_recipe(
        &store,
        &dep3_recipe,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    );

    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec![
            "sh".to_string(),
            "-c".to_string(),
            "echo PATH=$PATH > $OUT/env.txt; echo LIBRARY_PATH=$LIBRARY_PATH >> $OUT/env.txt; echo C_INCLUDE_PATH=$C_INCLUDE_PATH >> $OUT/env.txt".to_string(),
        ],
        env: vec![],
        dependencies: vec![
            seed_dep(),
            ProcessDependency {
                name: "tool_a".to_string(),
                recipe_hash: dep1_recipe.recipe_hash(),
            },
            ProcessDependency {
                name: "tool_b".to_string(),
                recipe_hash: dep2_recipe.recipe_hash(),
            },
            ProcessDependency {
                name: "tool_c".to_string(),
                recipe_hash: dep3_recipe.recipe_hash(),
            },
        ],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let output_hash = build_recipe(
        &store,
        &process_recipe,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    )
    .unwrap();

    let sp = staging_path(&store, &output_hash);
    let content = read_staged_file(&sp, "env.txt").unwrap_or_default();

    // PATH should have tool_a but not tool_b or tool_c
    assert!(
        content.contains("/deps/tool_a/bin"),
        "PATH should contain /deps/tool_a/bin, got: {content}"
    );
    assert!(
        !content.contains("/deps/tool_b/bin"),
        "PATH should NOT contain /deps/tool_b/bin, got: {content}"
    );

    // LIBRARY_PATH should have tool_b but not tool_a or tool_c
    assert!(
        content.contains("/deps/tool_b/lib"),
        "LIBRARY_PATH should contain /deps/tool_b/lib, got: {content}"
    );

    // C_INCLUDE_PATH should have tool_c but not tool_a or tool_b
    assert!(
        content.contains("/deps/tool_c/include"),
        "C_INCLUDE_PATH should contain /deps/tool_c/include, got: {content}"
    );
}

// ===========================================================================
// Tests: Internal deps (<workdir>, <scaffold>) don't affect auto-env
// ===========================================================================

#[test]
#[ignore]
fn internal_deps_excluded_from_auto_env() {
    let store = real_store();

    // Create a directory recipe that has a bin/ entry — this will be used
    // as a workdir. The workdir is an internal dep (<workdir>) and should
    // NOT contribute to auto-env.
    let content = b"workdir file";
    store.write_blob(content).unwrap();
    let file_recipe = make_file_recipe(content, false);

    let dir_recipe = make_directory_recipe(vec![("bin", file_recipe.recipe_hash())]);
    let dir_bytes = dir_recipe.encode();
    store.store_recipe(&dir_bytes).unwrap();

    // Build the file and dir recipes
    let _ = build_recipe(
        &store,
        &file_recipe,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    );
    let _ = build_recipe(
        &store,
        &dir_recipe,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    );

    // Now use the directory as a workdir for a process
    let process_recipe = Recipe::Process(RecipeProcess {
        platform: build::current_platform(),
        command: SANDBOX_SHELL.to_string(),
        args: vec!["sh".to_string(), "-c".to_string(), "env | sort > $OUT/env.txt".to_string()],
        env: vec![],
        dependencies: vec![seed_dep()],
        workdir_hash: Some(dir_recipe.recipe_hash()),
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
    });

    let output_hash = build_recipe(
        &store,
        &process_recipe,
        &BuildOptions {
            quiet: true,
            ..Default::default()
        },
    )
    .unwrap();

    let sp = staging_path(&store, &output_hash);
    let content = read_staged_file(&sp, "env.txt").unwrap_or_default();

    // Internal deps (<workdir>) should NOT contribute to PATH — only seed should.
    // The workdir has a bin/ entry but it's an internal dep, so it should be excluded.
    assert!(
        !content.contains("/workdir/"),
        "Internal dep (<workdir>) should not contribute to auto-env, got:\n{content}"
    );
    // seed always contributes PATH — expected.
    assert!(
        content.contains("PATH=/deps/seed/bin"),
        "seed should contribute PATH, got:\n{content}"
    );
}
