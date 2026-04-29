//! Recipe storage — store and retrieve raw `.hod` binary files.
//!
//! Recipes are stored on disk at `<store>/recipes/<shard>/<hex_hash>`, where
//! `<shard>` is the first two hex characters of the BLAKE3 hash. Metadata is
//! tracked in the SQLite `recipes` table.

use std::path::PathBuf;

use crate::hash::{hash_bytes, hash_shard, hash_to_hex, Hash};
use crate::recipe::{MAGIC, VERSION};

use super::{now_iso8601, Store, StoreError};

/// Store a raw recipe binary. Returns its BLAKE3 hash.
///
/// The `bytes` should be a complete `.hod` envelope (magic + version + type +
/// body_len + body). The hash is computed from the bytes, NOT trusted from
/// any caller. The recipe is parsed just enough to extract the type tag for
/// the DB record.
pub fn store(store: &Store, bytes: &[u8]) -> Result<Hash, StoreError> {
    let hash = hash_bytes(bytes);
    let hex = hash_to_hex(&hash);

    // Check if already stored
    if exists(store, &hash)? {
        return Ok(hash);
    }

    // Extract type tag (byte at offset 4) for the DB record
    let recipe_type = if bytes.len() >= 5 && &bytes[0..3] == MAGIC && bytes[3] == VERSION {
        bytes[4]
    } else {
        return Err(StoreError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "invalid recipe envelope: bad magic or version",
        )));
    };

    // Body size = total - header (3 + 1 + 1 + 4 = 9 bytes)
    let body_size = if bytes.len() >= 9 {
        let body_len =
            u32::from_le_bytes([bytes[5], bytes[6], bytes[7], bytes[8]]) as usize;
        // body starts at offset 9
        let actual_body = bytes.len().saturating_sub(9);
        if actual_body != body_len {
            return Err(StoreError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!(
                    "body_len mismatch: header says {body_len}, file has {actual_body} body bytes"
                ),
            )));
        }
        body_len
    } else {
        return Err(StoreError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "recipe file too short",
        )));
    };

    // Write file to disk
    let shard = hash_shard(&hash);
    let dir = store.recipes_dir().join(&shard);
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(&hex);
    let tmp_path = path.with_extension("tmp");
    std::fs::write(&tmp_path, bytes)?;
    std::fs::rename(&tmp_path, &path)?;

    // Record in DB
    let now = now_iso8601();
    store.conn().execute(
        "INSERT OR IGNORE INTO recipes (recipe_hash, recipe_type, stored_at, body_size) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![hex, recipe_type, now, body_size as i64],
    )?;

    Ok(hash)
}

/// Read a raw recipe binary by hash.
pub fn get(store: &Store, hash: &Hash) -> Result<Vec<u8>, StoreError> {
    let path = recipe_path(store, hash);
    if !path.exists() {
        return Err(StoreError::NotFound {
            what: "recipe".into(),
            hash: hash_to_hex(hash),
        });
    }
    Ok(std::fs::read(&path)?)
}

/// Check if a recipe exists (checks DB only — fast).
pub fn exists(store: &Store, hash: &Hash) -> Result<bool, StoreError> {
    let hex = hash_to_hex(hash);
    let count: i64 = store.conn().query_row(
        "SELECT COUNT(*) FROM recipes WHERE recipe_hash = ?1",
        rusqlite::params![hex],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

/// Resolve the on-disk path for a recipe.
pub fn recipe_path(store: &Store, hash: &Hash) -> PathBuf {
    let shard = hash_shard(hash);
    let hex = hash_to_hex(hash);
    store.recipes_dir().join(&shard).join(&hex)
}
