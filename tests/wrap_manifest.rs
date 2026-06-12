//! Integration test for the launcher/manifest path in `wrap::generate_wrappers`.
//!
//! This is the one seam the unit tests do not cover: the build-time decision to
//! wrap an output's executables with the static launcher + per-binary manifest
//! (rather than the legacy shell script). It exercises the real
//! `generate_wrappers` against a populated store:
//!
//! - a Process recipe (in the store) declaring `runtime.wrapper` directives,
//! - an output staging dir with a dynamic ELF + the `self:` target it references,
//! - a fake `hod-launcher` provider output supplying the launcher bytes.
//!
//! Asserts that the dynamic ELF is replaced by the launcher, the real binary is
//! moved aside to `_hod_wrapped/`, the manifest carries the `@self@`-tokenized
//! directive + EXEC line, and that the static-ELF structural guard leaves a
//! static binary untouched.
//!
//! Requires a host C compiler to produce real ELFs; skips (no-op) otherwise.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::Command;

use hod::build::artifact_staging_path;
use hod::hash::Hash;
use hod::manifest::{MANIFEST_DIR, WRAPPED_DIR};
use hod::recipe::{Recipe, RecipeProcess, RuntimeDirective, RuntimeMeta, RuntimeSource, WrapOp};
use hod::store::Store;
use hod::wrap::generate_wrappers;

fn find_cc() -> Option<String> {
    for cc in ["cc", "gcc", "clang"] {
        if Command::new(cc).arg("--version").output().is_ok() {
            return Some(cc.to_string());
        }
    }
    None
}

fn compile(cc: &str, src: &Path, out: &Path, static_link: bool) -> bool {
    let mut cmd = Command::new(cc);
    cmd.arg("-O2");
    if static_link {
        cmd.arg("-static");
    }
    cmd.arg("-o").arg(out).arg(src);
    cmd.status().map(|s| s.success()).unwrap_or(false)
}

/// A minimal Process recipe declaring a single `wrapper` directive
/// (`set MAGIC = self:share/misc/magic.mgc`) and no runtime deps.
fn magic_recipe() -> RecipeProcess {
    RecipeProcess {
        platform: "x86_64-linux".to_string(),
        command: "/bin/true".to_string(),
        args: vec![],
        env: vec![],
        dependencies: vec![],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0,
        runtime_deps: None,
        runtime: Some(RuntimeMeta {
            provides: vec![],
            wrapper: vec![RuntimeDirective {
                op: WrapOp::Set,
                var: "MAGIC".to_string(),
                sep: None,
                sources: vec![RuntimeSource::SelfPath("share/misc/magic.mgc".to_string())],
            }],
        }),
    }
}

#[test]
fn generate_wrappers_stamps_launcher_and_respects_static_guard() {
    let cc = match find_cc() {
        Some(c) => c,
        None => {
            eprintln!("[skip] no C compiler available; skipping wrap manifest test");
            return;
        }
    };

    let root: PathBuf =
        std::env::temp_dir().join(format!("hod-wrap-manifest-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).unwrap();
    let store = Store::open_at(&root).expect("open store");

    // Store the recipe; its content hash is what `generate_wrappers` resolves
    // the runtime closure from.
    let recipe = Recipe::Process(magic_recipe());
    let recipe_hash = store.store_recipe(&recipe.encode()).expect("store recipe");

    // Output staging dir for the recipe being wrapped. The `self:` MAGIC target
    // must exist on disk for the directive's existence guard to pass.
    let output_hash: Hash = [0x11; 32];
    let out = artifact_staging_path(&store, &output_hash);
    let bin = out.join("bin");
    std::fs::create_dir_all(&bin).unwrap();
    std::fs::create_dir_all(out.join("share/misc")).unwrap();
    std::fs::write(out.join("share/misc/magic.mgc"), b"magic-db").unwrap();

    // A real source compiled into a dynamic ELF (wrappable) and a static ELF
    // (must be skipped by the structural guard).
    let real_src = root.join("real.c");
    std::fs::write(&real_src, "int main(void){return 0;}\n").unwrap();

    assert!(
        compile(&cc, &real_src, &bin.join("app"), false),
        "failed to compile dynamic test binary"
    );
    let dynamic_bytes = std::fs::read(bin.join("app")).unwrap();
    assert!(
        hod::packed::is_elf(&dynamic_bytes) && hod::packed::parse_interp(&dynamic_bytes).is_some(),
        "test binary 'app' is not a dynamic ELF; cannot exercise the launcher path"
    );

    // Static binary is best-effort: some hosts lack a static libc. Only assert
    // the skip behavior when we actually produced a static (no PT_INTERP) ELF.
    let static_ok = compile(&cc, &real_src, &bin.join("tool"), true);
    let tool_is_static = static_ok && {
        let b = std::fs::read(bin.join("tool")).unwrap();
        hod::packed::is_elf(&b) && hod::packed::parse_interp(&b).is_none()
    };
    let tool_bytes_before = if tool_is_static {
        Some(std::fs::read(bin.join("tool")).unwrap())
    } else {
        // Not genuinely static — remove it so it doesn't get wrapped and skew
        // the count assertion.
        let _ = std::fs::remove_file(bin.join("tool"));
        None
    };

    // The launcher is provisioned by the build system (store config), not via
    // runtime deps. Provide its bytes directly, as `build.rs` does.
    let launcher_bytes = b"\x7fELF-fake-launcher-bytes".to_vec();

    // runtime_dep_outputs still feeds the legacy shell-path env detection; it no
    // longer carries the launcher.
    let runtime_dep_outputs: BTreeMap<String, Hash> = BTreeMap::new();

    let count = generate_wrappers(
        &store,
        &out,
        &runtime_dep_outputs,
        Some(&recipe_hash),
        Some(&launcher_bytes),
    )
    .expect("generate_wrappers");

    // Exactly the dynamic binary was wrapped.
    assert_eq!(count, 1, "expected exactly one wrapped executable");

    // bin/app is now the launcher; the real binary moved into _hod_wrapped/.
    assert_eq!(
        std::fs::read(bin.join("app")).unwrap(),
        launcher_bytes,
        "bin/app should be the stamped launcher"
    );
    let wrapped_real = bin.join(WRAPPED_DIR).join("app");
    assert!(wrapped_real.is_file(), "real binary not moved to _hod_wrapped/");
    assert_eq!(
        std::fs::read(&wrapped_real).unwrap(),
        dynamic_bytes,
        "moved-aside binary should be the original ELF"
    );

    // The manifest carries the tokenized MAGIC directive + EXEC line.
    let manifest = std::fs::read_to_string(bin.join(MANIFEST_DIR).join("app")).unwrap();
    assert!(manifest.starts_with("HODLAUNCH1\n"), "missing magic header: {manifest}");
    assert!(
        manifest.contains("EXEC @self@/bin/_hod_wrapped/app\n"),
        "missing EXEC line: {manifest}"
    );
    assert!(
        manifest.contains("SET MAGIC @self@/share/misc/magic.mgc\n"),
        "MAGIC directive not tokenized as expected: {manifest}"
    );

    // The static binary (if we made a genuine one) is left untouched: no wrap,
    // no manifest, no move.
    if let Some(before) = tool_bytes_before {
        assert_eq!(
            std::fs::read(bin.join("tool")).unwrap(),
            before,
            "static ELF should be left untouched"
        );
        assert!(
            !bin.join(WRAPPED_DIR).join("tool").exists(),
            "static ELF should not be moved into _hod_wrapped/"
        );
        assert!(
            !bin.join(MANIFEST_DIR).join("tool").exists(),
            "static ELF should not get a manifest"
        );
    }

    let _ = std::fs::remove_dir_all(&root);
}
