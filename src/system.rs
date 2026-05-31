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

use crate::hash::{hash_to_hex, Hash};
use crate::profile::{self, FarmEntry, ProfilePackage};
use crate::store::Store;

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

/// Materialize a new generation directory containing the populated farm and
/// metadata. Does not touch the `current` symlink. Returns the generation
/// number and its path on disk.
pub fn build_generation(
    store: &Store,
    profile_name: &str,
    packages: &[ProfilePackage],
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
// Misc helpers
// ---------------------------------------------------------------------------

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
