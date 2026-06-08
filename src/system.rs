//! System profiles — the OS-side counterpart to user profiles.
//!
//! A *user profile* (see [`crate::profile`]) is a per-user symlink farm
//! intended to be sourced from a shell, populating `PATH`, `MANPATH`, and
//! similar variables.
//!
//! A *system profile* is intended to define the running system: it pins a
//! set of Hod packages, creates a generation-numbered symlink farm, and
//! atomically switches a `current` symlink. It does **not** write shell env
//! scripts; the consumer (the bootloader, an `/etc` generator, the deploy
//! machinery, etc.) decides what to do with the farm. Future sub-plans
//! (`etc-generation.md`, `boot-integration.md`) extend this surface with
//! `/etc` rendering and systemd-unit generation.
//!
//! ## Layout
//!
//! ```text
//! $HOD_SYSTEM_DIR/
//!   generations/<gen>/             monotonic integer generations
//!     pkgs/<link-name> → <store staging path>
//!     runtime/<dep-name> → <store staging path>
//!     metadata.json                generation, profile name, recipe hashes, timestamp
//!   current → generations/<gen>    atomically swapped on activate/rollback
//! ```
//!
//! `$HOD_SYSTEM_DIR` defaults to `~/.local/share/hod/system/` to mirror the
//! user-profile layout. In the bootable Hod VM it lives at `/hod/system/`.
//! A GC root pin lives at `<roots-dir>/system-current.txt` (default
//! `~/.hod/roots/system-current.txt`).
//!
//! ## CLI surface
//!
//! - `hod system build <profile.ts>` — build the closure; do not activate.
//! - `hod system activate <profile.ts>` — build, materialize a new
//!   generation, swap `current`, update the GC root pin.
//! - `hod system list` — show generations with their profile name + size.
//! - `hod system rollback` — point `current` at the generation that was
//!   active before the most recent activation.
//! - `hod system pin <profile.ts>` — write the GC root file without
//!   activating.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::hash::{hash_to_hex, hex_to_hash, Hash};
use crate::profile::{self, FarmEntry, ProfilePackage};
use crate::store::{Store, StoreConfig};

// ---------------------------------------------------------------------------
// System config types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemUser {
    pub name: String,
    pub uid: u32,
    pub groups: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub home: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shell: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemGroup {
    pub name: String,
    pub gid: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemServices {
    pub enable: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disable: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemBoot {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kernel_args: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemConfig {
    pub hostname: String,
    #[serde(default = "default_timezone")]
    pub timezone: String,
    #[serde(default = "default_locale")]
    pub locale: String,
    #[serde(default = "default_kernel")]
    pub kernel: String,
    pub packages: Vec<ProfilePackage>,
    pub users: Vec<SystemUser>,
    pub groups: Vec<SystemGroup>,
    pub services: SystemServices,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub boot: Option<SystemBoot>,
}

fn default_timezone() -> String {
    "UTC".to_string()
}
fn default_locale() -> String {
    "en_US.UTF-8".to_string()
}
fn default_kernel() -> String {
    "arch".to_string()
}

// ---------------------------------------------------------------------------
// Bun evaluation
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct SystemOutputPackage {
    name: Option<String>,
    hash: String,
}

#[derive(Debug, Deserialize)]
struct SystemOutputUser {
    name: String,
    uid: u32,
    groups: Vec<String>,
    home: Option<String>,
    shell: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SystemOutputGroup {
    name: String,
    gid: u32,
}

#[derive(Debug, Deserialize)]
struct SystemOutputServices {
    enable: Vec<String>,
    disable: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct SystemOutputBoot {
    kernel_args: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct SystemOutput {
    hostname: String,
    timezone: Option<String>,
    locale: Option<String>,
    kernel: Option<String>,
    packages: Vec<SystemOutputPackage>,
    users: Vec<SystemOutputUser>,
    groups: Vec<SystemOutputGroup>,
    services: SystemOutputServices,
    boot: Option<SystemOutputBoot>,
}

pub fn evaluate_system(
    system_path: &Path,
    _store_config: &StoreConfig,
) -> Result<SystemConfig, String> {
    let abs_path = system_path.canonicalize().map_err(|e| {
        format!(
            "cannot resolve system path {}: {e}",
            system_path.display()
        )
    })?;

    let system_str = abs_path.to_string_lossy();

    let tmp = std::env::temp_dir().join("hod-system-eval.ts");
    let script = format!(
        r#"
import {{ system }} from "{system_str}";
const c = system.config;
const pkgs = c.packages.map((p, index) => {{
  if (typeof p === 'string') return {{ hash: p }};
  if (p && typeof p === 'object' && 'hash' in p) return {{ name: p.name, hash: p.hash }};
  const recipe = p?.recipe ?? p?.package;
  if (recipe && typeof recipe === 'object' && 'hash' in recipe) return {{ name: p.name, hash: recipe.hash }};
  throw new Error(`invalid system package at index ${{index}}`);
}});
console.log(JSON.stringify({{
  hostname: c.hostname,
  timezone: c.timezone,
  locale: c.locale,
  kernel: c.kernel,
  packages: pkgs,
  users: c.users,
  groups: c.groups,
  services: c.services,
  boot: c.boot,
}}));
"#,
        system_str = system_str,
    );
    std::fs::write(&tmp, &script).map_err(|e| format!("cannot write eval script: {e}"))?;

    let bun = std::env::var("BUN").unwrap_or_else(|_| "bun".to_string());
    let mut command = std::process::Command::new(&bun);
    command.arg("run").arg(&tmp);
    if std::env::var_os("HOD_BIN").is_none() {
        if let Ok(current_exe) = std::env::current_exe() {
            command.env("HOD_BIN", current_exe);
        }
    }
    let output = command
        .output()
        .map_err(|e| format!("failed to run `{bun} run`: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "`{bun} run` failed (exit {:?})\n{stdout}{stderr}",
            output.status.code()
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json_line = stdout
        .lines()
        .filter(|l| l.trim_start().starts_with('{'))
        .last()
        .ok_or_else(|| {
            format!(
                "system evaluation produced no JSON output.\n\
                 stdout: {stdout}"
            )
        })?;

    let sys_out: SystemOutput = serde_json::from_str(json_line.trim())
        .map_err(|e| format!("failed to parse system JSON: {e}\nline: {json_line}"))?;

    let mut packages = Vec::with_capacity(sys_out.packages.len());
    for (i, pkg) in sys_out.packages.iter().enumerate() {
        let hash = hex_to_hash(&pkg.hash).ok_or_else(|| {
            format!(
                "package [{}] has invalid hash '{}' (expected 64 hex chars)",
                i, pkg.hash
            )
        })?;
        packages.push(ProfilePackage {
            name: pkg.name.clone(),
            hash,
        });
    }

    let users = sys_out
        .users
        .into_iter()
        .map(|u| SystemUser {
            name: u.name,
            uid: u.uid,
            groups: u.groups,
            home: u.home,
            shell: u.shell,
        })
        .collect();

    let groups = sys_out
        .groups
        .into_iter()
        .map(|g| SystemGroup {
            name: g.name,
            gid: g.gid,
        })
        .collect();

    let boot = sys_out.boot.map(|b| SystemBoot {
        kernel_args: b.kernel_args,
    });

    Ok(SystemConfig {
        hostname: sys_out.hostname,
        timezone: sys_out.timezone.unwrap_or_else(default_timezone),
        locale: sys_out.locale.unwrap_or_else(default_locale),
        kernel: sys_out.kernel.unwrap_or_else(default_kernel),
        packages,
        users,
        groups,
        services: SystemServices {
            enable: sys_out.services.enable,
            disable: sys_out.services.disable,
        },
        boot,
    })
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/// Resolve the system profiles directory.
///
/// Priority: `HOD_SYSTEM_DIR` → `$XDG_DATA_HOME/hod/system` → `~/.local/share/hod/system`.
pub fn system_dir() -> PathBuf {
    if let Ok(p) = std::env::var("HOD_SYSTEM_DIR") {
        return PathBuf::from(p);
    }
    if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
        return PathBuf::from(xdg).join("hod").join("system");
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    PathBuf::from(home).join(".local/share/hod/system")
}

fn generations_dir() -> PathBuf {
    system_dir().join("generations")
}

fn current_link() -> PathBuf {
    system_dir().join("current")
}

fn roots_dir() -> PathBuf {
    if let Ok(p) = std::env::var("HOD_ROOTS_DIR") {
        return PathBuf::from(p);
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    PathBuf::from(home).join(".hod/roots")
}

fn system_roots_path() -> PathBuf {
    roots_dir().join("system-current.txt")
}

// ---------------------------------------------------------------------------
// Generation metadata
// ---------------------------------------------------------------------------

/// On-disk metadata for a system generation.
///
/// Written once when the generation is created. Read by `hod system list`,
/// `rollback`, and any consumer that needs to know which profile a given
/// generation came from.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GenerationMetadata {
    /// Monotonic integer generation number.
    pub generation: u64,
    /// ISO 8601 timestamp of creation (UTC).
    pub created_at: String,
    /// Profile name from the source `.ts` file.
    pub profile_name: String,
    /// Recipe hashes the profile was built from, in profile order.
    pub recipe_hashes: Vec<String>,
}

impl GenerationMetadata {
    fn path(generation_dir: &Path) -> PathBuf {
        generation_dir.join("metadata.json")
    }

    fn write(&self, generation_dir: &Path) -> Result<(), String> {
        let path = Self::path(generation_dir);
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("serialize generation metadata: {e}"))?;
        std::fs::write(&path, json + "\n")
            .map_err(|e| format!("write {}: {e}", path.display()))?;
        Ok(())
    }

    fn read(generation_dir: &Path) -> Result<Self, String> {
        let path = Self::path(generation_dir);
        let bytes = std::fs::read(&path).map_err(|e| format!("read {}: {e}", path.display()))?;
        serde_json::from_slice(&bytes)
            .map_err(|e| format!("parse {}: {e}", path.display()))
    }
}

// ---------------------------------------------------------------------------
// Generation listing
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct GenerationEntry {
    pub generation: u64,
    pub path: PathBuf,
    pub metadata: Option<GenerationMetadata>,
    pub is_current: bool,
}

pub fn list_generations() -> Result<Vec<GenerationEntry>, String> {
    let gens_dir = generations_dir();
    if !gens_dir.exists() {
        return Ok(Vec::new());
    }

    let current_target = std::fs::read_link(current_link())
        .ok()
        .and_then(|p| {
            // Normalize: extract just the generation number from the symlink target.
            p.file_name().map(|n| n.to_string_lossy().to_string())
        });

    let mut entries: Vec<GenerationEntry> = Vec::new();
    for dir_entry in std::fs::read_dir(&gens_dir)
        .map_err(|e| format!("read {}: {e}", gens_dir.display()))?
    {
        let dir_entry = dir_entry.map_err(|e| format!("read dir entry: {e}"))?;
        let path = dir_entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let generation = match name.parse::<u64>() {
            Ok(g) => g,
            Err(_) => continue, // skip non-numeric entries
        };
        let metadata = GenerationMetadata::read(&path).ok();
        let is_current = current_target.as_deref() == Some(name.as_str());
        entries.push(GenerationEntry {
            generation,
            path,
            metadata,
            is_current,
        });
    }
    entries.sort_by_key(|e| e.generation);
    Ok(entries)
}

fn next_generation_number() -> Result<u64, String> {
    let gens = list_generations()?;
    Ok(gens.iter().map(|g| g.generation).max().unwrap_or(0) + 1)
}

fn current_generation_number() -> Option<u64> {
    let target = std::fs::read_link(current_link()).ok()?;
    target
        .file_name()
        .and_then(|n| n.to_str())
        .and_then(|s| s.parse::<u64>().ok())
}

// ---------------------------------------------------------------------------
// Build + activate
// ---------------------------------------------------------------------------

/// Materialize a new generation directory containing the populated farm,
/// metadata, and optionally /etc + composefs image. Does not touch the
/// `current` symlink. Returns the generation number and its path on disk.
pub fn build_generation(
    store: &Store,
    profile_name: &str,
    packages: &[ProfilePackage],
    system_config: Option<&SystemConfig>,
) -> Result<(u64, PathBuf), String> {
    std::fs::create_dir_all(generations_dir())
        .map_err(|e| format!("cannot create generations dir: {e}"))?;

    let generation = next_generation_number()?;
    let gen_dir = generations_dir().join(generation.to_string());
    let tmp_dir = generations_dir().join(format!(".{generation}.tmp"));

    // Clean any stale tmp from a prior failed run.
    if tmp_dir.exists() {
        std::fs::remove_dir_all(&tmp_dir)
            .map_err(|e| format!("remove stale tmp generation dir: {e}"))?;
    }

    let _entries: Vec<FarmEntry> = profile::populate_farm(&tmp_dir, store, packages)?;

    // Write metadata.
    let metadata = GenerationMetadata {
        generation,
        created_at: now_iso8601(),
        profile_name: profile_name.to_string(),
        recipe_hashes: packages.iter().map(|p| hash_to_hex(&p.hash)).collect(),
    };
    metadata.write(&tmp_dir)?;

    // Write system config if provided.
    if let Some(config) = system_config {
        let config_json = serde_json::to_string_pretty(config)
            .map_err(|e| format!("serialize system config: {e}"))?;
        std::fs::write(tmp_dir.join("system.json"), config_json + "\n")
            .map_err(|e| format!("write system.json: {e}"))?;

        generate_etc(&tmp_dir, config)?;
    }

    // Atomic-rename into place.
    std::fs::rename(&tmp_dir, &gen_dir).map_err(|e| {
        format!(
            "rename generation tmp {} → {}: {e}",
            tmp_dir.display(),
            gen_dir.display()
        )
    })?;

    Ok((generation, gen_dir))
}

/// Switch `current` to point at `generation`. Updates the GC root pin.
///
/// The implementation creates a temporary symlink and renames it over the
/// existing `current` link, which is atomic on POSIX filesystems.
pub fn activate_generation(generation: u64, profile_name: &str, hashes: &[Hash]) -> Result<(), String> {
    let gen_dir = generations_dir().join(generation.to_string());
    if !gen_dir.is_dir() {
        return Err(format!("generation {generation} does not exist"));
    }

    let target = PathBuf::from("generations").join(generation.to_string());
    let current = current_link();
    let tmp = system_dir().join(".current.tmp");

    // Ensure parent exists.
    if let Some(parent) = current.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("create system dir: {e}"))?;
    }

    if tmp.exists() || tmp.is_symlink() {
        let _ = std::fs::remove_file(&tmp);
    }
    std::os::unix::fs::symlink(&target, &tmp).map_err(|e| {
        format!(
            "create temp current symlink {} → {}: {e}",
            tmp.display(),
            target.display()
        )
    })?;
    std::fs::rename(&tmp, &current)
        .map_err(|e| format!("swap current symlink: {e}"))?;

    write_system_roots(profile_name, hashes)?;
    Ok(())
}

/// Roll back to the previous generation (in numeric-descending order).
///
/// Returns the generation we rolled to, or `Err` if there is nothing to roll
/// back to.
pub fn rollback() -> Result<u64, String> {
    let current = match current_generation_number() {
        Some(g) => g,
        None => {
            return Err("no current generation to roll back from".to_string());
        }
    };

    let gens = list_generations()?;
    let prev = gens
        .iter()
        .rev()
        .find(|g| g.generation < current)
        .ok_or_else(|| {
            format!("no generation older than {current} to roll back to")
        })?;

    let metadata = prev
        .metadata
        .clone()
        .ok_or_else(|| format!("generation {} has no metadata", prev.generation))?;

    let hashes: Vec<Hash> = metadata
        .recipe_hashes
        .iter()
        .filter_map(|h| crate::hash::hex_to_hash(h))
        .collect();

    activate_generation(prev.generation, &metadata.profile_name, &hashes)?;
    Ok(prev.generation)
}

// ---------------------------------------------------------------------------
// GC roots
// ---------------------------------------------------------------------------

pub fn write_system_roots(profile_name: &str, hashes: &[Hash]) -> Result<(), String> {
    let path = system_roots_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("create roots dir {}: {e}", parent.display()))?;
    }
    let mut content = String::new();
    content.push_str(&format!("# hod roots: system profile {profile_name}\n"));
    for hash in hashes {
        content.push_str(&hash_to_hex(hash));
        content.push('\n');
    }
    std::fs::write(&path, content)
        .map_err(|e| format!("write {}: {e}", path.display()))?;
    Ok(())
}

pub fn remove_system_roots() -> Result<bool, String> {
    let path = system_roots_path();
    if !path.exists() {
        return Ok(false);
    }
    std::fs::remove_file(&path)
        .map_err(|e| format!("remove {}: {e}", path.display()))?;
    Ok(true)
}

// ---------------------------------------------------------------------------
// /etc generation
// ---------------------------------------------------------------------------

pub fn generate_etc(
    gen_dir: &Path,
    config: &SystemConfig,
) -> Result<(), String> {
    let etc = gen_dir.join("etc");
    std::fs::create_dir_all(&etc)
        .map_err(|e| format!("create etc dir: {e}"))?;

    generate_passwd(&etc, config)?;
    generate_group(&etc, config)?;
    generate_hostname(&etc, config)?;
    generate_timezone(&etc, config)?;
    generate_locale_conf(&etc, config)?;
    generate_ld_so_conf(&etc)?;
    generate_os_release(&etc, config)?;
    generate_systemd_symlinks(&etc, config)?;
    generate_fstab(&etc)?;

    Ok(())
}

fn generate_passwd(etc: &Path, config: &SystemConfig) -> Result<(), String> {
    let mut content = String::new();
    content.push_str("root:x:0:0:root:/root:/usr/bin/bash\n");
    content.push_str("nobody:x:65534:65534:Nobody:/:/usr/bin/false\n");
    for user in &config.users {
        let home = user.home.as_deref().unwrap_or("/tmp");
        let shell = user.shell.as_deref().unwrap_or("/usr/bin/bash");
        let primary_gid = config
            .groups
            .iter()
            .find(|g| user.groups.first().map(|n| n == &g.name).unwrap_or(false))
            .map(|g| g.gid)
            .unwrap_or(1000);
        content.push_str(&format!(
            "{}:x:{}:{}::{}:{}\n",
            user.name, user.uid, primary_gid, home, shell
        ));
    }
    std::fs::write(etc.join("passwd"), content)
        .map_err(|e| format!("write passwd: {e}"))?;
    Ok(())
}

fn generate_group(etc: &Path, config: &SystemConfig) -> Result<(), String> {
    let mut content = String::new();
    content.push_str("root:x:0:\n");
    content.push_str("nobody:x:65534:\n");
    for group in &config.groups {
        let members: Vec<&str> = config
            .users
            .iter()
            .filter(|u| u.groups.contains(&group.name))
            .map(|u| u.name.as_str())
            .collect();
        content.push_str(&format!("{}:x:{}:{}\n", group.name, group.gid, members.join(",")));
    }
    std::fs::write(etc.join("group"), content)
        .map_err(|e| format!("write group: {e}"))?;
    Ok(())
}

fn generate_hostname(etc: &Path, config: &SystemConfig) -> Result<(), String> {
    std::fs::write(etc.join("hostname"), format!("{}\n", config.hostname))
        .map_err(|e| format!("write hostname: {e}"))?;
    std::fs::write(
        etc.join("hosts"),
        format!("127.0.0.1 localhost\n127.0.1.1 {}\n", config.hostname),
    )
    .map_err(|e| format!("write hosts: {e}"))?;
    Ok(())
}

fn generate_timezone(etc: &Path, config: &SystemConfig) -> Result<(), String> {
    let zoneinfo = format!("/usr/share/zoneinfo/{}", config.timezone);
    std::fs::write(etc.join("timezone"), format!("{}\n", config.timezone))
        .map_err(|e| format!("write timezone: {e}"))?;
    if let Some(parent) = etc.join("localtime").parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::os::unix::fs::symlink(&zoneinfo, etc.join("localtime"));
    Ok(())
}

fn generate_locale_conf(etc: &Path, config: &SystemConfig) -> Result<(), String> {
    std::fs::write(
        etc.join("locale.conf"),
        format!("LANG={}\n", config.locale),
    )
    .map_err(|e| format!("write locale.conf: {e}"))?;
    Ok(())
}

fn generate_ld_so_conf(etc: &Path) -> Result<(), String> {
    let content = "/usr/lib\n/include /etc/ld.so.conf.d/*.conf\n";
    std::fs::write(etc.join("ld.so.conf"), content)
        .map_err(|e| format!("write ld.so.conf: {e}"))?;
    let ld_dir = etc.join("ld.so.conf.d");
    std::fs::create_dir_all(&ld_dir)
        .map_err(|e| format!("create ld.so.conf.d: {e}"))?;
    Ok(())
}

fn generate_os_release(etc: &Path, config: &SystemConfig) -> Result<(), String> {
    let content = format!(
        "NAME=\"Hod OS\"\n\
         VERSION=\"0.1.0\"\n\
         ID=hod\n\
         ID_LIKE=arch\n\
         PRETTY_NAME=\"Hod OS ({hostname})\"\n\
         HOME_URL=\"https://github.com/anomalyco/hod\"\n\
         BUILD_ID=0\n",
        hostname = config.hostname,
    );
    std::fs::write(etc.join("os-release"), content)
        .map_err(|e| format!("write os-release: {e}"))?;
    Ok(())
}

fn generate_systemd_symlinks(etc: &Path, config: &SystemConfig) -> Result<(), String> {
    let multi_user = etc.join("systemd/system/multi-user.target.wants");
    std::fs::create_dir_all(&multi_user)
        .map_err(|e| format!("create multi-user.target.wants: {e}"))?;

    for svc in &config.services.enable {
        let target = format!("/usr/lib/systemd/system/{svc}.service");
        let link = multi_user.join(format!("{svc}.service"));
        let _ = std::os::unix::fs::symlink(&target, &link);
    }

    Ok(())
}

fn generate_fstab(etc: &Path) -> Result<(), String> {
    let content = "\
# Hod OS fstab — composefs root + btrfs
LABEL=hod    /            btrfs    subvol=root,compress=zstd:1    0 0
LABEL=hod    /hod         btrfs    subvol=hod,compress=zstd:1    0 0
tmpfs        /tmp         tmpfs    defaults,nosuid,nodev         0 0
";
    std::fs::write(etc.join("fstab"), content)
        .map_err(|e| format!("write fstab: {e}"))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Composefs generation
// ---------------------------------------------------------------------------

pub fn generate_composefs(
    store: &Store,
    gen_dir: &Path,
) -> Result<(), String> {
    let script_path = std::env::current_exe()
        .ok()
        .and_then(|exe| {
            let dir = exe.parent()?;
            let repo_root = dir.parent()?.parent()?.parent()?;
            let script = repo_root.join("scripts/generate-composefs");
            if script.exists() {
                Some(script)
            } else {
                None
            }
        })
        .unwrap_or_else(|| PathBuf::from("scripts/generate-composefs"));

    let hod_bin = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("hod"));

    let status = std::process::Command::new(&script_path)
        .arg(gen_dir)
        .arg(gen_dir.join("composefs"))
        .arg(&hod_bin)
        .env("HOD_STORE", store.root())
        .status()
        .map_err(|e| format!("failed to run generate-composefs: {e}"))?;

    if !status.success() {
        return Err(format!(
            "generate-composefs failed (exit {:?})",
            status.code()
        ));
    }

    Ok(())
}

/// Best-effort UTC ISO-8601 timestamp without external deps. Format:
/// `YYYY-MM-DDTHH:MM:SSZ`. Falls back to the unix epoch as ISO if anything
/// goes wrong (the timestamp is informational, not part of the contract).
fn now_iso8601() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Convert seconds-since-epoch to a calendar date manually to avoid pulling
    // chrono in. Good enough for human-readable metadata.
    let (year, month, day, hour, min, sec) = unix_to_ymdhms(now);
    format!(
        "{year:04}-{month:02}-{day:02}T{hour:02}:{min:02}:{sec:02}Z"
    )
}

fn unix_to_ymdhms(epoch_secs: u64) -> (i32, u32, u32, u32, u32, u32) {
    // Standard "civil from days" algorithm (Howard Hinnant).
    let total = epoch_secs as i64;
    let days = total / 86_400;
    let secs_of_day = (total % 86_400) as u32;
    let hour = secs_of_day / 3600;
    let min = (secs_of_day % 3600) / 60;
    let sec = secs_of_day % 60;

    // Days from 1970-01-01.
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = (if m <= 2 { y + 1 } else { y }) as i32;
    (year, m as u32, d as u32, hour, min, sec)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unix_to_ymdhms_known_values() {
        // 1970-01-01T00:00:00Z
        assert_eq!(unix_to_ymdhms(0), (1970, 1, 1, 0, 0, 0));
        // 2026-05-28T12:34:56Z
        assert_eq!(unix_to_ymdhms(1779971696), (2026, 5, 28, 12, 34, 56));
        // 2000-02-29T00:00:00Z (leap day) = 951782400
        assert_eq!(unix_to_ymdhms(951782400), (2000, 2, 29, 0, 0, 0));
    }
}
