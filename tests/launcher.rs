//! End-to-end test for the static `hod-launcher` (launcher/hod-launcher.c).
//!
//! Compiles the launcher with the host C compiler, lays out a fake store
//! output (`<root>/<shard>/<hex>/bin/...`), writes a v1 manifest, and runs the
//! launcher to verify:
//!
//! - `argv[0]` is preserved (so `ps`/profilers and git self-dispatch work),
//! - injected `FLAG`s precede user args,
//! - `@self@`/`@store@` tokens expand from `/proc/self/exe`,
//! - `SETDEFAULT`/`PREFIX`/`UNSET` behave correctly.
//!
//! The test skips (does not fail) when no C compiler is available, so it is a
//! no-op outside environments that provide `cc`/`gcc`.

use std::path::{Path, PathBuf};
use std::process::Command;

fn find_cc() -> Option<String> {
    for cc in ["cc", "gcc", "clang"] {
        if Command::new(cc).arg("--version").output().is_ok() {
            return Some(cc.to_string());
        }
    }
    None
}

fn compile(cc: &str, src: &Path, out: &Path) -> bool {
    Command::new(cc)
        .arg("-O2")
        .arg("-o")
        .arg(out)
        .arg(src)
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[test]
fn launcher_preserves_argv0_and_applies_manifest() {
    let cc = match find_cc() {
        Some(c) => c,
        None => {
            eprintln!("[skip] no C compiler available; skipping launcher e2e test");
            return;
        }
    };

    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let launcher_src = Path::new(manifest_dir).join("launcher/hod-launcher.c");
    assert!(launcher_src.exists(), "launcher source missing");

    let root: PathBuf = std::env::temp_dir().join(format!("hod-launcher-e2e-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);

    let shard = "aa";
    let hex = "a".repeat(64);
    let prefix = root.join(shard).join(&hex);
    let bin = prefix.join("bin");
    let wrapped = bin.join("_hod_wrapped");
    let manifest_subdir = bin.join(".hod-launcher");
    std::fs::create_dir_all(&wrapped).unwrap();
    std::fs::create_dir_all(&manifest_subdir).unwrap();

    // A dep output that @store@ should reach.
    let dep_shard = "cc";
    let dep_hex = "c".repeat(64);
    let dep_share = root.join(dep_shard).join(&dep_hex).join("share");
    std::fs::create_dir_all(&dep_share).unwrap();
    // self share dir (exists, so PREFIX includes it)
    std::fs::create_dir_all(prefix.join("share")).unwrap();

    // Real program: prints argv and a few env vars.
    let real_src = root.join("real.c");
    std::fs::write(
        &real_src,
        r#"#include <stdio.h>
#include <stdlib.h>
int main(int argc, char**argv){
  printf("ARGV0=%s\n", argv[0]);
  for(int i=1;i<argc;i++) printf("ARG=%s\n", argv[i]);
  const char*x=getenv("XDG_DATA_DIRS"); printf("XDG=%s\n", x?x:"(null)");
  const char*g=getenv("GSK_RENDERER"); printf("GSK=%s\n", g?g:"(null)");
  const char*e=getenv("GIO_EXTRA"); printf("GIO=%s\n", e?e:"(unset)");
  return 0;
}
"#,
    )
    .unwrap();

    assert!(
        compile(&cc, &real_src, &wrapped.join("app")),
        "failed to compile real program"
    );
    assert!(
        compile(&cc, &launcher_src, &bin.join("app")),
        "failed to compile launcher"
    );

    // Manifest exercising token expansion + env ops.
    let manifest = format!(
        "HODLAUNCH1\n\
         EXEC @self@/bin/_hod_wrapped/app\n\
         SETDEFAULT GSK_RENDERER cairo\n\
         PREFIX XDG_DATA_DIRS : @self@/share:@store@/{dep_shard}/{dep_hex}/share\n\
         UNSET GIO_EXTRA\n\
         FLAG --hod-flag\n\
         INHERIT_ARGV0\n"
    );
    std::fs::write(manifest_subdir.join("app"), manifest).unwrap();

    let output = Command::new(bin.join("app"))
        .arg("userarg")
        .env("GIO_EXTRA", "/should/be/removed")
        .env("XDG_DATA_DIRS", "/usr/share")
        .env_remove("GSK_RENDERER")
        .output()
        .expect("failed to run launcher");

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(output.status.success(), "launcher exited nonzero: {stdout}");

    // argv[0] preserved as the launcher invocation path (ends with /bin/app).
    let argv0_line = stdout
        .lines()
        .find(|l| l.starts_with("ARGV0="))
        .expect("no ARGV0 line");
    assert!(
        argv0_line.ends_with("/bin/app"),
        "argv0 not preserved: {argv0_line}"
    );

    // Injected flag precedes user args.
    let args: Vec<&str> = stdout
        .lines()
        .filter_map(|l| l.strip_prefix("ARG="))
        .collect();
    assert_eq!(args, vec!["--hod-flag", "userarg"], "flag/arg order wrong");

    // Token expansion: @self@ → prefix, @store@ → root.
    let xdg = stdout
        .lines()
        .find_map(|l| l.strip_prefix("XDG="))
        .unwrap();
    let expect_self = prefix.join("share");
    let expect_store = root.join(dep_shard).join(&dep_hex).join("share");
    assert!(
        xdg.contains(expect_self.to_str().unwrap()),
        "XDG missing @self@ expansion: {xdg}"
    );
    assert!(
        xdg.contains(expect_store.to_str().unwrap()),
        "XDG missing @store@ expansion: {xdg}"
    );
    assert!(xdg.ends_with("/usr/share"), "XDG didn't keep inherited tail: {xdg}");

    // SETDEFAULT applied (was unset), UNSET removed GIO_EXTRA.
    assert!(stdout.contains("GSK=cairo"), "SETDEFAULT not applied: {stdout}");
    assert!(stdout.contains("GIO=(unset)"), "UNSET not applied: {stdout}");

    let _ = std::fs::remove_dir_all(&root);
}
