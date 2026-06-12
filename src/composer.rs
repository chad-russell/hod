//! Generic runtime-environment composer.
//!
//! This module turns declarative [`RuntimeMeta`](crate::recipe::RuntimeMeta)
//! (provider contributions + wrapper directives) into a concrete, ordered list
//! of resolved env operations, then applies that list to whatever consumer
//! needs it: a process environment (`hod run` / `hod shell`), a profile env
//! script, or — in a later step — a per-binary launcher manifest.
//!
//! It deliberately embeds **no** package/ecosystem knowledge. The composer
//! only knows how to:
//!
//! 1. **Aggregate.** Collect `provides` directives from the output itself and
//!    from every dependency in its runtime closure, then append the output's
//!    own `wrapper` directives. This mirrors the nixpkgs setup-hook model:
//!    each provider declares what it contributes, and a dumb aggregator stacks
//!    the contributions.
//! 2. **Resolve.** Turn each directive's value sources
//!    ([`RuntimeSource`](crate::recipe::RuntimeSource)) into concrete strings
//!    via a [`SourceResolver`], honoring the implicit "skip if the path does
//!    not exist" guard on path-valued sources.
//! 3. **Apply.** Render the resolved directives into a process environment
//!    ([`apply_env`]) or shell snippets ([`to_posix_exports`],
//!    [`to_fish_exports`], [`to_systemd_assignments`]).
//!
//! The aggregation order is: the output's own `provides`, then each provider's
//! `provides` (in closure order), then the output's own `wrapper` directives.
//! This puts the output's own contributions first (matching the prior wrapper
//! behavior where `$prefix/share` led `XDG_DATA_DIRS`) while letting wrapper
//! directives apply last so they can override provider defaults.

use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};

use crate::hash::{hash_to_hex, Hash};
use crate::recipe::{Recipe, RuntimeDirective, RuntimeMeta, RuntimeSource, WrapOp};
use crate::store::Store;

/// A directive whose value sources have been resolved to concrete strings.
///
/// Path-valued sources that failed their existence guard are filtered out
/// before this is produced; an env-setting directive with no surviving values
/// is dropped entirely (it would be a no-op). `Unset`/`InheritArgv0` carry no
/// values and are always retained.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedDirective {
    /// The operation to perform.
    pub op: WrapOp,
    /// Target environment variable (empty for `AddFlags`/`InheritArgv0`).
    pub var: String,
    /// Separator for `Prefix`/`Suffix` (empty for other ops).
    pub sep: String,
    /// Resolved, existence-checked values, in declaration order.
    pub values: Vec<String>,
}

/// Resolves directive value sources to concrete strings.
///
/// Implementations decide how a `self:`/`dep:` reference maps to an on-disk
/// path and what string to emit. Path-valued sources carry an implicit
/// "skip if the path does not exist" guard: returning `None` means the guard
/// failed and the source contributes nothing.
pub trait SourceResolver {
    /// Resolve a `self:`/`dep:` subpath.
    ///
    /// `provider` is `None` for the output's own prefix, or `Some(dep_name)`
    /// for a named runtime dependency. Returns the emitted string only if the
    /// resolved path exists; `None` means the existence guard failed (or the
    /// named provider is unknown).
    fn resolve_path(&self, provider: Option<&str>, sub: &str) -> Option<String>;
}

/// A provider in a runtime closure: a dependency that may contribute env via
/// its `provides` directives.
#[derive(Debug, Clone)]
pub struct Provider {
    /// The runtime-dependency name this provider was referenced by.
    pub name: String,
    /// Output hash of the provider's built output (used to derive its
    /// store-relative shard/hash path for launcher manifests).
    pub output_hash: Hash,
    /// Absolute staging path of the provider's built output.
    pub staging_path: PathBuf,
    /// The provider's declared runtime metadata.
    pub meta: RuntimeMeta,
}

/// The runtime metadata needed to compose an output's environment: the
/// output's own metadata plus the providers in its transitive runtime closure.
#[derive(Debug, Clone, Default)]
pub struct RuntimeClosure {
    /// The output's own runtime metadata.
    pub own: RuntimeMeta,
    /// Providers in the transitive runtime closure, in BFS order.
    pub providers: Vec<Provider>,
}

impl RuntimeClosure {
    /// True when there is nothing to compose (no own directives and no
    /// provider contributions). Callers can use this to skip work entirely.
    pub fn is_empty(&self) -> bool {
        self.own.provides.is_empty()
            && self.own.wrapper.is_empty()
            && self.providers.iter().all(|p| p.meta.provides.is_empty())
    }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/// A [`SourceResolver`] backed by the on-disk store: `self:` resolves against
/// the output's own staging dir, `dep:<name>` against the named provider's
/// staging dir, and the existence guard is a real filesystem check.
pub struct StoreResolver {
    own_staging: PathBuf,
    by_name: HashMap<String, PathBuf>,
}

impl StoreResolver {
    /// Build a resolver from the output's own staging path and the providers
    /// in its runtime closure.
    pub fn new(own_staging: &Path, providers: &[Provider]) -> Self {
        let mut by_name = HashMap::new();
        for p in providers {
            // First occurrence wins; closure BFS order means the nearest
            // reference to a name is preferred.
            by_name
                .entry(p.name.clone())
                .or_insert_with(|| p.staging_path.clone());
        }
        Self {
            own_staging: own_staging.to_path_buf(),
            by_name,
        }
    }
}

impl SourceResolver for StoreResolver {
    fn resolve_path(&self, provider: Option<&str>, sub: &str) -> Option<String> {
        let base = match provider {
            None => &self.own_staging,
            Some(name) => self.by_name.get(name)?,
        };
        let full = base.join(sub);
        if full.exists() {
            Some(full.to_string_lossy().into_owned())
        } else {
            None
        }
    }
}

/// Resolve a single value source. `self_provider` is the provider whose `self:`
/// references this directive belongs to (`None` for the output itself).
fn resolve_source(
    src: &RuntimeSource,
    self_provider: Option<&str>,
    resolver: &dyn SourceResolver,
) -> Option<String> {
    match src {
        RuntimeSource::Literal(v) => Some(v.clone()),
        RuntimeSource::SelfPath(sub) => resolver.resolve_path(self_provider, sub),
        RuntimeSource::Dep(d) => resolver.resolve_path(Some(&d.name), &d.sub),
        RuntimeSource::FirstExisting(list) => list
            .iter()
            .find_map(|s| resolve_source(s, self_provider, resolver)),
    }
}

/// Resolve one directive into a [`ResolvedDirective`], or `None` if it becomes
/// a no-op (all path guards failed for an env-setting op).
fn resolve_directive(
    d: &RuntimeDirective,
    self_provider: Option<&str>,
    resolver: &dyn SourceResolver,
) -> Option<ResolvedDirective> {
    match d.op {
        WrapOp::Unset | WrapOp::InheritArgv0 => Some(ResolvedDirective {
            op: d.op,
            var: d.var.clone(),
            sep: String::new(),
            values: Vec::new(),
        }),
        _ => {
            let values: Vec<String> = d
                .sources
                .iter()
                .filter_map(|s| resolve_source(s, self_provider, resolver))
                .collect();
            if values.is_empty() {
                // Every source's existence guard failed → contributes nothing.
                return None;
            }
            Some(ResolvedDirective {
                op: d.op,
                var: d.var.clone(),
                sep: d.sep.clone().unwrap_or_default(),
                values,
            })
        }
    }
}

/// Aggregate and resolve runtime directives for an output.
///
/// Order: the output's own `provides`, then each provider's `provides` (with
/// that provider's `self:` rebased to the provider), then the output's own
/// `wrapper` directives.
pub fn compose(
    own: &RuntimeMeta,
    providers: &[Provider],
    resolver: &dyn SourceResolver,
) -> Vec<ResolvedDirective> {
    let mut out = Vec::new();

    for d in &own.provides {
        if let Some(rd) = resolve_directive(d, None, resolver) {
            out.push(rd);
        }
    }
    for p in providers {
        for d in &p.meta.provides {
            if let Some(rd) = resolve_directive(d, Some(&p.name), resolver) {
                out.push(rd);
            }
        }
    }
    for d in &own.wrapper {
        if let Some(rd) = resolve_directive(d, None, resolver) {
            out.push(rd);
        }
    }

    out
}

/// Convenience: compose directly from a [`RuntimeClosure`] and the output's own
/// staging path, using a [`StoreResolver`].
pub fn compose_closure(closure: &RuntimeClosure, own_staging: &Path) -> Vec<ResolvedDirective> {
    let resolver = StoreResolver::new(own_staging, &closure.providers);
    compose(&closure.own, &closure.providers, &resolver)
}

// ---------------------------------------------------------------------------
// Application: process environment
// ---------------------------------------------------------------------------

/// Default separator for env operations that produce a path list but carry no
/// explicit separator (e.g. a multi-source `Set`).
const DEFAULT_SEP: &str = ":";

fn join(values: &[String], sep: &str) -> String {
    let sep = if sep.is_empty() { DEFAULT_SEP } else { sep };
    values.join(sep)
}

/// Apply resolved directives to a process environment map, in order.
///
/// `AddFlags`/`Argv0`/`InheritArgv0` are exec-time concerns, not environment
/// operations, so they are ignored here. They are honored by the launcher
/// manifest path (a later step).
pub fn apply_env(env: &mut HashMap<String, String>, dirs: &[ResolvedDirective]) {
    for d in dirs {
        match d.op {
            WrapOp::Set => {
                env.insert(d.var.clone(), join(&d.values, &d.sep));
            }
            WrapOp::SetDefault => {
                let unset = env.get(&d.var).map_or(true, |v| v.is_empty());
                if unset {
                    env.insert(d.var.clone(), join(&d.values, &d.sep));
                }
            }
            WrapOp::Unset => {
                env.remove(&d.var);
            }
            WrapOp::Prefix => {
                let add = join(&d.values, &d.sep);
                let cur = env.get(&d.var).cloned().unwrap_or_default();
                let sep = if d.sep.is_empty() {
                    DEFAULT_SEP
                } else {
                    &d.sep
                };
                let new = if cur.is_empty() {
                    add
                } else {
                    format!("{add}{sep}{cur}")
                };
                env.insert(d.var.clone(), new);
            }
            WrapOp::Suffix => {
                let add = join(&d.values, &d.sep);
                let cur = env.get(&d.var).cloned().unwrap_or_default();
                let sep = if d.sep.is_empty() {
                    DEFAULT_SEP
                } else {
                    &d.sep
                };
                let new = if cur.is_empty() {
                    add
                } else {
                    format!("{cur}{sep}{add}")
                };
                env.insert(d.var.clone(), new);
            }
            WrapOp::AddFlags | WrapOp::Argv0 | WrapOp::InheritArgv0 => {}
        }
    }
}

// ---------------------------------------------------------------------------
// Application: shell snippets
// ---------------------------------------------------------------------------

/// Minimal double-quote escaping for POSIX/systemd contexts. Store paths do not
/// normally contain shell metacharacters, but escape the characters that would
/// break a double-quoted string just in case.
fn sh_escape(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('$', "\\$")
        .replace('`', "\\`")
}

/// Render resolved directives as POSIX `sh` statements (one per line).
///
/// Only environment operations are emitted; `AddFlags`/`Argv0`/`InheritArgv0`
/// are exec-time concerns with no meaning in a sourced env script.
pub fn to_posix_exports(dirs: &[ResolvedDirective]) -> String {
    let mut out = String::new();
    for d in dirs {
        let var = &d.var;
        match d.op {
            WrapOp::Set => {
                let val = sh_escape(&join(&d.values, &d.sep));
                out.push_str(&format!("export {var}=\"{val}\"\n"));
            }
            WrapOp::SetDefault => {
                let val = sh_escape(&join(&d.values, &d.sep));
                out.push_str(&format!(
                    "if [ -z \"${{{var}:-}}\" ]; then export {var}=\"{val}\"; fi\n"
                ));
            }
            WrapOp::Unset => {
                out.push_str(&format!("unset {var}\n"));
            }
            WrapOp::Prefix => {
                let sep = if d.sep.is_empty() {
                    DEFAULT_SEP
                } else {
                    &d.sep
                };
                let val = sh_escape(&join(&d.values, sep));
                out.push_str(&format!("export {var}=\"{val}${{{var}:+{sep}${var}}}\"\n"));
            }
            WrapOp::Suffix => {
                let sep = if d.sep.is_empty() {
                    DEFAULT_SEP
                } else {
                    &d.sep
                };
                let val = sh_escape(&join(&d.values, sep));
                out.push_str(&format!("export {var}=\"${{{var}:+${var}{sep}}}{val}\"\n"));
            }
            WrapOp::AddFlags | WrapOp::Argv0 | WrapOp::InheritArgv0 => {}
        }
    }
    out
}

/// Render resolved directives as `fish` statements (one per line).
pub fn to_fish_exports(dirs: &[ResolvedDirective]) -> String {
    let mut out = String::new();
    for d in dirs {
        let var = &d.var;
        match d.op {
            WrapOp::Set => {
                let val = sh_escape(&join(&d.values, &d.sep));
                out.push_str(&format!("set -gx {var} \"{val}\"\n"));
            }
            WrapOp::SetDefault => {
                let val = sh_escape(&join(&d.values, &d.sep));
                out.push_str(&format!(
                    "if not set -q {var}; set -gx {var} \"{val}\"; end\n"
                ));
            }
            WrapOp::Unset => {
                out.push_str(&format!("set -e {var}\n"));
            }
            WrapOp::Prefix => {
                let sep = if d.sep.is_empty() {
                    DEFAULT_SEP
                } else {
                    &d.sep
                };
                let val = sh_escape(&join(&d.values, sep));
                out.push_str(&format!("set -gx {var} \"{val}{sep}${var}\"\n"));
            }
            WrapOp::Suffix => {
                let sep = if d.sep.is_empty() {
                    DEFAULT_SEP
                } else {
                    &d.sep
                };
                let val = sh_escape(&join(&d.values, sep));
                out.push_str(&format!("set -gx {var} \"${var}{sep}{val}\"\n"));
            }
            WrapOp::AddFlags | WrapOp::Argv0 | WrapOp::InheritArgv0 => {}
        }
    }
    out
}

/// Render resolved directives as systemd `EnvironmentFile` assignments.
///
/// systemd env files are plain `KEY=VALUE` with no support for referencing the
/// pre-existing value, so `Prefix`/`Suffix` are emitted as their resolved
/// addition only (best effort) and `Unset` is skipped (systemd cannot unset a
/// variable from an `EnvironmentFile`).
pub fn to_systemd_assignments(dirs: &[ResolvedDirective]) -> String {
    let mut out = String::new();
    for d in dirs {
        match d.op {
            WrapOp::Set | WrapOp::SetDefault | WrapOp::Prefix | WrapOp::Suffix => {
                out.push_str(&format!("{}={}\n", d.var, join(&d.values, &d.sep)));
            }
            WrapOp::Unset | WrapOp::AddFlags | WrapOp::Argv0 | WrapOp::InheritArgv0 => {}
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Closure collection from the store
// ---------------------------------------------------------------------------

/// Collect the runtime metadata needed to compose `recipe_hash`'s environment:
/// the recipe's own [`RuntimeMeta`] plus the providers in its transitive
/// runtime closure (each with staging path + metadata).
///
/// The closure is walked over `runtime_deps` edges (Nix-style), deduplicated by
/// recipe hash, in BFS order so nearer references take precedence when names
/// collide. Missing recipes / outputs are skipped with a warning, never a hard
/// error — composition proceeds with whatever resolved.
pub fn collect_runtime_closure(store: &Store, recipe_hash: &Hash) -> RuntimeClosure {
    let own_recipe = match load_process(store, recipe_hash) {
        Some(p) => p,
        None => return RuntimeClosure::default(),
    };

    let own = own_recipe.runtime.clone().unwrap_or_default();

    let mut providers: Vec<Provider> = Vec::new();
    let mut visited: HashSet<Hash> = HashSet::new();
    visited.insert(*recipe_hash);

    // Seed the worklist from the output's own runtime_deps.
    let mut worklist: VecDeque<(String, Hash)> = VecDeque::new();
    seed_worklist(&own_recipe, &mut worklist);

    while let Some((name, rh)) = worklist.pop_front() {
        if !visited.insert(rh) {
            continue;
        }

        let p = match load_process(store, &rh) {
            Some(p) => p,
            None => continue,
        };

        let output_hash = match store.get_output(&rh) {
            Ok(Some(h)) => h,
            Ok(None) => {
                eprintln!(
                    "[hod] warning: runtime provider '{name}' (recipe {}) has no built output; \
                     skipping in runtime closure",
                    hash_to_hex(&rh),
                );
                continue;
            }
            Err(e) => {
                eprintln!("[hod] warning: error looking up output for provider '{name}': {e}");
                continue;
            }
        };
        let staging_path = crate::build::artifact_staging_path(store, &output_hash);

        providers.push(Provider {
            name,
            output_hash,
            staging_path,
            meta: p.runtime.clone().unwrap_or_default(),
        });

        seed_worklist(&p, &mut worklist);
    }

    RuntimeClosure { own, providers }
}

/// Push a process recipe's `runtime_deps` (resolved to recipe hashes via its
/// own `dependencies` list) onto the worklist.
fn seed_worklist(p: &crate::recipe::RecipeProcess, worklist: &mut VecDeque<(String, Hash)>) {
    let names = match p.runtime_deps.as_ref() {
        Some(n) => n,
        None => return,
    };
    for name in names {
        if let Some(dep) = p.dependencies.iter().find(|d| &d.name == name) {
            worklist.push_back((name.clone(), dep.recipe_hash));
        }
    }
}

/// Load and decode a Process recipe from the store, or `None` if it is missing,
/// undecodable, or not a Process recipe.
fn load_process(store: &Store, recipe_hash: &Hash) -> Option<crate::recipe::RecipeProcess> {
    let bytes = match store.get_recipe(recipe_hash) {
        Ok(b) => b,
        Err(e) => {
            eprintln!(
                "[hod] warning: cannot read recipe {} for runtime composition: {e}",
                hash_to_hex(recipe_hash),
            );
            return None;
        }
    };
    match Recipe::decode(&bytes) {
        Ok(Recipe::Process(p)) => Some(p),
        Ok(_) => None,
        Err(e) => {
            eprintln!(
                "[hod] warning: cannot decode recipe {} for runtime composition: {e}",
                hash_to_hex(recipe_hash),
            );
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recipe::{DepRef, RuntimeDirective, RuntimeMeta, RuntimeSource, WrapOp};
    use std::collections::HashMap;

    /// A resolver driven by an in-memory set of "existing" paths, keyed by
    /// `(provider, sub)`. Emits `<provider-or-self>/<sub>` when present.
    struct FakeResolver {
        existing: HashSet<(Option<String>, String)>,
    }

    impl FakeResolver {
        fn new(paths: &[(Option<&str>, &str)]) -> Self {
            Self {
                existing: paths
                    .iter()
                    .map(|(p, s)| (p.map(|x| x.to_string()), s.to_string()))
                    .collect(),
            }
        }
    }

    impl SourceResolver for FakeResolver {
        fn resolve_path(&self, provider: Option<&str>, sub: &str) -> Option<String> {
            let key = (provider.map(|p| p.to_string()), sub.to_string());
            if self.existing.contains(&key) {
                let base = provider.unwrap_or("self");
                Some(format!("/store/{base}/{sub}"))
            } else {
                None
            }
        }
    }

    fn set(var: &str, src: RuntimeSource) -> RuntimeDirective {
        RuntimeDirective {
            op: WrapOp::Set,
            var: var.to_string(),
            sep: None,
            sources: vec![src],
        }
    }

    fn prefix(var: &str, srcs: Vec<RuntimeSource>) -> RuntimeDirective {
        RuntimeDirective {
            op: WrapOp::Prefix,
            var: var.to_string(),
            sep: Some(":".to_string()),
            sources: srcs,
        }
    }

    #[test]
    fn existence_guard_drops_missing_path_directives() {
        let own = RuntimeMeta {
            provides: vec![],
            wrapper: vec![set(
                "MAGIC",
                RuntimeSource::SelfPath("share/misc/magic.mgc".into()),
            )],
        };
        // No paths exist.
        let resolver = FakeResolver::new(&[]);
        let dirs = compose(&own, &[], &resolver);
        assert!(dirs.is_empty(), "missing path should drop the directive");
    }

    #[test]
    fn self_path_resolves_against_output() {
        let own = RuntimeMeta {
            provides: vec![],
            wrapper: vec![set(
                "MAGIC",
                RuntimeSource::SelfPath("share/misc/magic.mgc".into()),
            )],
        };
        let resolver = FakeResolver::new(&[(None, "share/misc/magic.mgc")]);
        let dirs = compose(&own, &[], &resolver);
        assert_eq!(dirs.len(), 1);
        assert_eq!(dirs[0].var, "MAGIC");
        assert_eq!(dirs[0].values, vec!["/store/self/share/misc/magic.mgc"]);
    }

    #[test]
    fn provider_self_rebases_to_provider() {
        // glib provides GSETTINGS_SCHEMA_PATH via its own schemas dir.
        let glib = Provider {
            name: "glib".to_string(),
            output_hash: [0u8; 32],
            staging_path: PathBuf::from("/unused"),
            meta: RuntimeMeta {
                provides: vec![prefix(
                    "GSETTINGS_SCHEMA_PATH",
                    vec![RuntimeSource::SelfPath("share/glib-2.0/schemas".into())],
                )],
                wrapper: vec![],
            },
        };
        let own = RuntimeMeta::default();
        let resolver = FakeResolver::new(&[(Some("glib"), "share/glib-2.0/schemas")]);
        let dirs = compose(&own, &[glib], &resolver);
        assert_eq!(dirs.len(), 1);
        assert_eq!(dirs[0].op, WrapOp::Prefix);
        assert_eq!(dirs[0].values, vec!["/store/glib/share/glib-2.0/schemas"]);
    }

    #[test]
    fn first_existing_picks_first_present() {
        let own = RuntimeMeta {
            provides: vec![],
            wrapper: vec![set(
                "MAGIC",
                RuntimeSource::FirstExisting(vec![
                    RuntimeSource::SelfPath("share/misc/magic.mgc".into()),
                    RuntimeSource::Dep(DepRef {
                        name: "file".into(),
                        sub: "share/misc/magic.mgc".into(),
                    }),
                ]),
            )],
        };
        // Only the dep path exists.
        let resolver = FakeResolver::new(&[(Some("file"), "share/misc/magic.mgc")]);
        let dirs = compose(&own, &[], &resolver);
        assert_eq!(dirs.len(), 1);
        assert_eq!(dirs[0].values, vec!["/store/file/share/misc/magic.mgc"]);
    }

    #[test]
    fn apply_env_set_default_and_prefix() {
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
                values: vec!["/a/share".into(), "/b/share".into()],
            },
        ];

        let mut env: HashMap<String, String> = HashMap::new();
        env.insert("XDG_DATA_DIRS".into(), "/usr/share".into());
        env.insert("GSK_RENDERER".into(), "vulkan".into()); // already set → kept

        apply_env(&mut env, &dirs);

        assert_eq!(env.get("GSK_RENDERER").unwrap(), "vulkan");
        assert_eq!(
            env.get("XDG_DATA_DIRS").unwrap(),
            "/a/share:/b/share:/usr/share"
        );
    }

    #[test]
    fn apply_env_unset_removes() {
        let dirs = vec![ResolvedDirective {
            op: WrapOp::Unset,
            var: "GIO_EXTRA_MODULES".into(),
            sep: String::new(),
            values: vec![],
        }];
        let mut env: HashMap<String, String> = HashMap::new();
        env.insert("GIO_EXTRA_MODULES".into(), "/nix/whatever".into());
        apply_env(&mut env, &dirs);
        assert!(!env.contains_key("GIO_EXTRA_MODULES"));
    }

    #[test]
    fn posix_exports_render_expected_shapes() {
        let dirs = vec![
            ResolvedDirective {
                op: WrapOp::Set,
                var: "MAGIC".into(),
                sep: String::new(),
                values: vec!["/m/magic.mgc".into()],
            },
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
                values: vec!["/a/share".into()],
            },
            ResolvedDirective {
                op: WrapOp::Unset,
                var: "GIO_EXTRA_MODULES".into(),
                sep: String::new(),
                values: vec![],
            },
        ];
        let sh = to_posix_exports(&dirs);
        assert!(sh.contains("export MAGIC=\"/m/magic.mgc\"\n"));
        assert!(sh
            .contains("if [ -z \"${GSK_RENDERER:-}\" ]; then export GSK_RENDERER=\"cairo\"; fi\n"));
        assert!(sh.contains("export XDG_DATA_DIRS=\"/a/share${XDG_DATA_DIRS:+:$XDG_DATA_DIRS}\"\n"));
        assert!(sh.contains("unset GIO_EXTRA_MODULES\n"));
    }

    #[test]
    fn argv_and_flags_ops_are_ignored_by_env_consumers() {
        let dirs = vec![
            ResolvedDirective {
                op: WrapOp::InheritArgv0,
                var: String::new(),
                sep: String::new(),
                values: vec![],
            },
            ResolvedDirective {
                op: WrapOp::AddFlags,
                var: String::new(),
                sep: String::new(),
                values: vec!["--flag".into()],
            },
        ];
        let mut env: HashMap<String, String> = HashMap::new();
        apply_env(&mut env, &dirs);
        assert!(env.is_empty());
        assert!(to_posix_exports(&dirs).is_empty());
    }
}
