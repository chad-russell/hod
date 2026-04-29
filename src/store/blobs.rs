//! Blob storage — read, write, and deduplicate content-addressed blobs.
//!
//! Blobs are stored on disk at `<store>/blobs/<shard>/<hex_hash>`, where
//! `<shard>` is the first two hex characters of the BLAKE3 hash. Metadata
//! is tracked in the SQLite `blobs` table.

use std::path::PathBuf;

use crate::hash::{hash_bytes, hash_shard, hash_to_hex, Hash};

use super::{now_iso8601, Store, StoreError};

/// Write a blob to the store. Returns its BLAKE3 hash.
///
/// If the blob already exists (same hash), this is a no-op (dedup).
pub fn write(store: &Store, data: &[u8]) -> Result<Hash, StoreError> {
    let hash = hash_bytes(data);
    let hex = hash_to_hex(&hash);

    // Check if already stored
    if exists(store, &hash)? {
        return Ok(hash);
    }

    // Write file to disk
    let shard = hash_shard(&hash);
    let dir = store.blobs_dir().join(&shard);
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(&hex);
    // Write atomically: write to a temp file then rename
    let tmp_path = path.with_extension("tmp");
    std::fs::write(&tmp_path, data)?;
    std::fs::rename(&tmp_path, &path)?;

    // Record in DB
    let now = now_iso8601();
    store.conn().execute(
        "INSERT OR IGNORE INTO blobs (blob_hash, blob_size, stored_at) VALUES (?1, ?2, ?3)",
        rusqlite::params![hex, data.len() as i64, now],
    )?;

    Ok(hash)
}

/// Read a blob by hash.
pub fn read(store: &Store, hash: &Hash) -> Result<Vec<u8>, StoreError> {
    let path = blob_path(store, hash);
    if !path.exists() {
        return Err(StoreError::NotFound {
            what: "blob".into(),
            hash: hash_to_hex(hash),
        });
    }
    Ok(std::fs::read(&path)?)
}

/// Check if a blob exists (checks DB only — fast).
pub fn exists(store: &Store, hash: &Hash) -> Result<bool, StoreError> {
    let hex = hash_to_hex(hash);
    let count: i64 = store.conn().query_row(
        "SELECT COUNT(*) FROM blobs WHERE blob_hash = ?1",
        rusqlite::params![hex],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

/// Resolve the on-disk path for a blob.
pub fn blob_path(store: &Store, hash: &Hash) -> PathBuf {
    let shard = hash_shard(hash);
    let hex = hash_to_hex(hash);
    store.blobs_dir().join(&shard).join(&hex)
}
