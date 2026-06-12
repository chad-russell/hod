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

    let shard = hash_shard(&hash);
    let dir = store.blobs_dir().join(&shard);
    let path = dir.join(&hex);

    // Dedup on the actual on-disk blob, not just the DB row. A `blobs` row can
    // outlive its backing file — e.g. blobs pruned to reclaim space, or a DB
    // synced from another store (copy-closure / a shared hod.db) without all
    // the blob files. Trusting the row alone would skip writing here and then
    // fail later reads with "blob not found", even when we hold the bytes and
    // could heal the store. Re-derive the file whenever it is absent.
    if path.exists() {
        // Make sure the DB knows about it (a prior write may have left only the
        // file, or the row may already be present — INSERT OR IGNORE is safe).
        let now = now_iso8601();
        store.conn().execute(
            "INSERT OR IGNORE INTO blobs (blob_hash, blob_size, stored_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![hex, data.len() as i64, now],
        )?;
        return Ok(hash);
    }

    // Write file to disk
    std::fs::create_dir_all(&dir)?;
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
