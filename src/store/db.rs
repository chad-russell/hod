//! SQLite schema management.

use rusqlite::Connection;

use super::StoreError;

/// Run all database migrations. Creates tables if they don't exist.
pub fn migrate(conn: &Connection) -> Result<(), StoreError> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS recipes (
            recipe_hash  TEXT PRIMARY KEY,
            recipe_type  INTEGER NOT NULL,
            stored_at    TEXT NOT NULL,
            body_size    INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS outputs (
            recipe_hash  TEXT PRIMARY KEY,
            output_hash  TEXT NOT NULL,
            built_at     TEXT NOT NULL,
            build_ms     INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS build_logs (
            recipe_hash  TEXT PRIMARY KEY,
            stdout_blob  TEXT,
            stderr_blob  TEXT,
            exit_code    INTEGER NOT NULL,
            built_at     TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS dependencies (
            recipe_hash  TEXT NOT NULL,
            dep_hash     TEXT NOT NULL,
            dep_name     TEXT,
            PRIMARY KEY (recipe_hash, dep_hash)
        );

        CREATE INDEX IF NOT EXISTS idx_deps_reverse ON dependencies (dep_hash);

        CREATE TABLE IF NOT EXISTS blobs (
            blob_hash    TEXT PRIMARY KEY,
            blob_size    INTEGER NOT NULL,
            stored_at    TEXT NOT NULL
        );
        ",
    )?;
    Ok(())
}
