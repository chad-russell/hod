//! Launcher manifest format and emission.
//!
//! A *manifest* is the per-binary data file read by the static `hod-launcher`
//! (see `launcher/hod-launcher.c`). It encodes the resolved runtime directives
//! for one wrapped executable: which real binary to exec, and what env
//! operations / argv adjustments to apply first.
//!
//! ## Why a manifest instead of a shell script
//!
//! The legacy `src/wrap.rs` writes POSIX-shell wrapper scripts. Those cannot
//! preserve `argv[0]` (so `ps`/profilers show the wrapper, and git aliases need
//! special-casing), and they require `/bin/sh`. The launcher is a tiny static
//! musl ELF that `execv`s the real binary with `argv[0]` preserved, reading its
//! per-binary manifest at runtime. This module produces those manifests.
//!
//! ## Relocatability
//!
//! Manifests must survive `copy-closure` to a machine with a different store
//! root. Paths are therefore encoded as **store-relative tokens**, expanded by
//! the launcher from its own location (`/proc/self/exe`):
//!
//! - [`TOKEN_SELF`] (`@self@`) → the output's own prefix
//!   (`dirname(dirname(exe))`, i.e. the directory containing `bin/`).
//! - [`TOKEN_STORE`] (`@store@`) → the store staging root
//!   (`dirname(dirname(dirname(dirname(exe))))`, i.e. three levels above
//!   `bin/`, matching the `$ORIGIN/../../../<shard>/<hash>` convention used by
//!   `src/relocate.rs`).
//!
//! A `dep:` reference resolves to `@store@/<shard>/<hash>/<sub>`; a `self:`
//! reference resolves to `@self@/<sub>`; literals pass through unchanged.
//!
//! ## Format (v1, line-oriented text)
//!
//! ```text
//! HODLAUNCH1
//! EXEC <token-path>            # real binary to exec (e.g. @self@/bin/_hod_wrapped/foo)
//! SET <VAR> <value>            # value is the rest of the line
//! SETDEFAULT <VAR> <value>
//! UNSET <VAR>
//! PREFIX <VAR> <SEP> <value>   # SEP is a single whitespace-free token
//! SUFFIX <VAR> <SEP> <value>
//! FLAG <value>                 # inject one argument before user args
//! ARGV0 <value>                # override argv[0]
//! INHERIT_ARGV0                # keep the caller's argv[0] (default)
//! ```
//!
//! Values are the remainder of the line, so they may contain spaces (and the
//! `:`-joined path lists produced for `PREFIX`/`SUFFIX`). They may not contain
//! newlines, which store paths never do.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::composer::{Provider, ResolvedDirective, SourceResolver};
use crate::hash::{hash_shard, hash_to_hex};
use crate::recipe::WrapOp;

/// Magic header identifying a v1 manifest.
pub const MAGIC: &str = "HODLAUNCH1";

/// Token expanded by the launcher to the output's own prefix.
pub const TOKEN_SELF: &str = "@self@";

/// Token expanded by the launcher to the store staging root.
pub const TOKEN_STORE: &str = "@store@";

/// Relative path of the launcher binary within its provider output. Both the
/// launcher recipe and the build-time detection agree on this location.
pub const LAUNCHER_REL: &str = "libexec/hod-launcher";

/// Store-config key recording the recipe hash of the active `hod-launcher`.
///
/// The launcher is build-system infrastructure, not a recipe dependency: the
/// build system stamps its bytes over wrapped executables during post-build
/// fixup. The TS SDK registers the launcher recipe under this key when
/// `hod-launcher.ts` is imported, so the build system can build/read it without
/// any package having to declare `hod-launcher` in its deps or runtime_deps.
pub const LAUNCHER_RECIPE_CONFIG_KEY: &str = "launcher_recipe";

/// Directory (under the output's `bin/`) holding per-binary manifests.
pub const MANIFEST_DIR: &str = ".hod-launcher";

/// Directory (under `bin/`) holding the moved-aside real binaries.
pub const WRAPPED_DIR: &str = "_hod_wrapped";

const DEFAULT_SEP: &str = ":";

// ---------------------------------------------------------------------------
// Build-time source resolution → store-relative tokens
// ---------------------------------------------------------------------------

/// A [`SourceResolver`] that emits store-relative **tokens** for the launcher
/// manifest, while performing the existence guard against the real on-disk
/// staging directories at build time.
///
/// `self:` paths resolve to `@self@/<sub>` (checked against the output being
/// wrapped); `dep:` paths resolve to `@store@/<shard>/<hash>/<sub>` (checked
/// against the dependency's staging directory).
pub struct ManifestResolver {
    own_staging: PathBuf,
    by_name: HashMap<String, (String, String, PathBuf)>,
}

impl ManifestResolver {
    /// Build a resolver from the output's own staging directory (the directory
    /// being wrapped) and the providers in its runtime closure.
    pub fn new(own_staging: &Path, providers: &[Provider]) -> Self {
        let mut by_name = HashMap::new();
        for p in providers {
            let shard = hash_shard(&p.output_hash);
            let hex = hash_to_hex(&p.output_hash);
            by_name
                .entry(p.name.clone())
                .or_insert_with(|| (shard, hex, p.staging_path.clone()));
        }
        Self {
            own_staging: own_staging.to_path_buf(),
            by_name,
        }
    }
}

impl SourceResolver for ManifestResolver {
    fn resolve_path(&self, provider: Option<&str>, sub: &str) -> Option<String> {
        let sub = sub.trim_start_matches('/');
        match provider {
            None => {
                if self.own_staging.join(sub).exists() {
                    Some(format!("{TOKEN_SELF}/{sub}"))
                } else {
                    None
                }
            }
            Some(name) => {
                let (shard, hex, staging) = self.by_name.get(name)?;
                if staging.join(sub).exists() {
                    Some(format!("{TOKEN_STORE}/{shard}/{hex}/{sub}"))
                } else {
                    None
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

fn join(values: &[String], sep: &str) -> String {
    let sep = if sep.is_empty() { DEFAULT_SEP } else { sep };
    values.join(sep)
}

/// Serialize resolved directives into a v1 manifest.
///
/// `exec_token` is the token-encoded path of the real binary to exec, typically
/// `@self@/bin/_hod_wrapped/<name>`.
pub fn serialize(exec_token: &str, dirs: &[ResolvedDirective]) -> String {
    let mut out = String::new();
    out.push_str(MAGIC);
    out.push('\n');
    out.push_str("EXEC ");
    out.push_str(exec_token);
    out.push('\n');

    for d in dirs {
        match d.op {
            WrapOp::Set => {
                out.push_str(&format!("SET {} {}\n", d.var, join(&d.values, &d.sep)));
            }
            WrapOp::SetDefault => {
                out.push_str(&format!(
                    "SETDEFAULT {} {}\n",
                    d.var,
                    join(&d.values, &d.sep)
                ));
            }
            WrapOp::Unset => {
                out.push_str(&format!("UNSET {}\n", d.var));
            }
            WrapOp::Prefix => {
                let sep = if d.sep.is_empty() {
                    DEFAULT_SEP
                } else {
                    &d.sep
                };
                out.push_str(&format!(
                    "PREFIX {} {} {}\n",
                    d.var,
                    sep,
                    join(&d.values, sep)
                ));
            }
            WrapOp::Suffix => {
                let sep = if d.sep.is_empty() {
                    DEFAULT_SEP
                } else {
                    &d.sep
                };
                out.push_str(&format!(
                    "SUFFIX {} {} {}\n",
                    d.var,
                    sep,
                    join(&d.values, sep)
                ));
            }
            WrapOp::AddFlags => {
                for v in &d.values {
                    out.push_str(&format!("FLAG {v}\n"));
                }
            }
            WrapOp::Argv0 => {
                if let Some(v) = d.values.first() {
                    out.push_str(&format!("ARGV0 {v}\n"));
                }
            }
            WrapOp::InheritArgv0 => {
                out.push_str("INHERIT_ARGV0\n");
            }
        }
    }

    out
}

// ---------------------------------------------------------------------------
// Installation
// ---------------------------------------------------------------------------

/// Token-encoded exec path for a wrapped binary moved into `_hod_wrapped/`.
pub fn wrapped_exec_token(name: &str) -> String {
    format!("{TOKEN_SELF}/bin/{WRAPPED_DIR}/{name}")
}

/// Install a launcher-based wrapper for `name` in `bin_dir`.
///
/// Preconditions: the real binary has already been moved to
/// `bin/_hod_wrapped/<name>` by the caller. This writes:
///
/// - `bin/<name>` — a copy of the launcher binary (executable).
/// - `bin/.hod-launcher/<name>` — the manifest text.
pub fn install(
    bin_dir: &Path,
    name: &str,
    launcher_bytes: &[u8],
    manifest_text: &str,
) -> std::io::Result<()> {
    let manifest_dir = bin_dir.join(MANIFEST_DIR);
    std::fs::create_dir_all(&manifest_dir)?;
    std::fs::write(manifest_dir.join(name), manifest_text)?;

    let launcher_path = bin_dir.join(name);
    std::fs::write(&launcher_path, launcher_bytes)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&launcher_path, std::fs::Permissions::from_mode(0o755))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::composer::{compose, Provider};
    use crate::recipe::{DepRef, RuntimeDirective, RuntimeMeta, RuntimeSource};

    #[test]
    fn manifest_resolver_emits_self_and_store_tokens() {
        let tmp = std::env::temp_dir().join(format!("hod-manifest-test-{}", std::process::id()));
        let own = tmp.join("own");
        let dep = tmp.join("dep");
        std::fs::create_dir_all(own.join("share/misc")).unwrap();
        std::fs::write(own.join("share/misc/magic.mgc"), b"x").unwrap();
        std::fs::create_dir_all(dep.join("share/glib-2.0/schemas")).unwrap();

        let providers = vec![Provider {
            name: "glib".into(),
            output_hash: [0xab; 32],
            staging_path: dep.clone(),
            meta: RuntimeMeta::default(),
        }];
        let r = ManifestResolver::new(&own, &providers);

        // self path that exists
        assert_eq!(
            r.resolve_path(None, "share/misc/magic.mgc").as_deref(),
            Some("@self@/share/misc/magic.mgc")
        );
        // self path that does not exist → guard fails
        assert_eq!(r.resolve_path(None, "nope"), None);
        // dep path that exists
        let hex = hash_to_hex(&[0xab; 32]);
        let shard = hash_shard(&[0xab; 32]);
        assert_eq!(
            r.resolve_path(Some("glib"), "share/glib-2.0/schemas")
                .as_deref(),
            Some(format!("@store@/{shard}/{hex}/share/glib-2.0/schemas").as_str())
        );
        // unknown dep
        assert_eq!(r.resolve_path(Some("nope"), "x"), None);

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn serialize_roundtrips_expected_lines() {
        let dirs = vec![
            ResolvedDirective {
                op: WrapOp::SetDefault,
                var: "GSK_RENDERER".into(),
                sep: String::new(),
                values: vec!["cairo".into()],
            },
            ResolvedDirective {
                op: WrapOp::Prefix,
                var: "XDG_DATA_DIRS".into(),
                sep: ":".into(),
                values: vec!["@self@/share".into(), "@store@/aa/bb/share".into()],
            },
            ResolvedDirective {
                op: WrapOp::Unset,
                var: "GIO_EXTRA_MODULES".into(),
                sep: String::new(),
                values: vec![],
            },
            ResolvedDirective {
                op: WrapOp::InheritArgv0,
                var: String::new(),
                sep: String::new(),
                values: vec![],
            },
        ];
        let m = serialize(&wrapped_exec_token("nautilus"), &dirs);
        let lines: Vec<&str> = m.lines().collect();
        assert_eq!(lines[0], "HODLAUNCH1");
        assert_eq!(lines[1], "EXEC @self@/bin/_hod_wrapped/nautilus");
        assert!(m.contains("SETDEFAULT GSK_RENDERER cairo\n"));
        assert!(m.contains("PREFIX XDG_DATA_DIRS : @self@/share:@store@/aa/bb/share\n"));
        assert!(m.contains("UNSET GIO_EXTRA_MODULES\n"));
        assert!(m.contains("INHERIT_ARGV0\n"));
    }

    #[test]
    fn compose_then_serialize_uses_tokens() {
        // glib provides GSETTINGS_SCHEMA_PATH; file provides MAGIC via dep.
        let tmp = std::env::temp_dir().join(format!("hod-manifest-c-{}", std::process::id()));
        let own = tmp.join("own");
        let glib = tmp.join("glib");
        std::fs::create_dir_all(glib.join("share/glib-2.0/schemas")).unwrap();
        std::fs::create_dir_all(&own).unwrap();

        let providers = vec![Provider {
            name: "glib".into(),
            output_hash: [0x11; 32],
            staging_path: glib.clone(),
            meta: RuntimeMeta {
                provides: vec![RuntimeDirective {
                    op: WrapOp::Prefix,
                    var: "GSETTINGS_SCHEMA_PATH".into(),
                    sep: Some(":".into()),
                    sources: vec![RuntimeSource::SelfPath("share/glib-2.0/schemas".into())],
                }],
                wrapper: vec![],
            },
        }];
        let own_meta = RuntimeMeta {
            provides: vec![],
            wrapper: vec![RuntimeDirective {
                op: WrapOp::InheritArgv0,
                var: String::new(),
                sep: None,
                sources: vec![],
            }],
        };

        let resolver = ManifestResolver::new(&own, &providers);
        let dirs = compose(&own_meta, &providers, &resolver);
        let m = serialize(&wrapped_exec_token("app"), &dirs);

        let hex = hash_to_hex(&[0x11; 32]);
        let shard = hash_shard(&[0x11; 32]);
        assert!(m.contains(&format!(
            "PREFIX GSETTINGS_SCHEMA_PATH : @store@/{shard}/{hex}/share/glib-2.0/schemas\n"
        )));
        assert!(m.contains("INHERIT_ARGV0\n"));

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn install_writes_launcher_and_manifest() {
        let tmp = std::env::temp_dir().join(format!("hod-manifest-i-{}", std::process::id()));
        let bin = tmp.join("bin");
        std::fs::create_dir_all(bin.join(WRAPPED_DIR)).unwrap();
        std::fs::write(bin.join(WRAPPED_DIR).join("foo"), b"real").unwrap();

        install(
            &bin,
            "foo",
            b"\x7fELF-launcher",
            "HODLAUNCH1\nEXEC @self@/bin/_hod_wrapped/foo\n",
        )
        .unwrap();

        assert_eq!(std::fs::read(bin.join("foo")).unwrap(), b"\x7fELF-launcher");
        let manifest = std::fs::read_to_string(bin.join(MANIFEST_DIR).join("foo")).unwrap();
        assert!(manifest.starts_with("HODLAUNCH1\n"));

        std::fs::remove_dir_all(&tmp).ok();
    }
}
