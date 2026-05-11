//! Store — persistent content-addressed storage.
//!
//! The store is SQLite + filesystem. Metadata lives in `hod.db`, blobs and
//! recipes are sharded on disk by the first two hex chars of their BLAKE3 hash.
//!
//! See PRD §5 for the full design.

// Sub-modules — not re-exported as public types; access via Store methods.
mod blobs;
mod db;
mod recipes;

use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::hash::{hash_to_hex, Hash};

// ---------------------------------------------------------------------------
// Store error type
// ---------------------------------------------------------------------------

/// Errors from store operations.
#[derive(Debug)]
pub enum StoreError {
    /// An IO error on the filesystem.
    Io(std::io::Error),
    /// A SQLite error.
    Sqlite(rusqlite::Error),
    /// The requested blob / recipe / output was not found.
    NotFound { what: String, hash: String },
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(e) => write!(f, "store IO error: {e}"),
            Self::Sqlite(e) => write!(f, "store SQLite error: {e}"),
            Self::NotFound { what, hash } => write!(f, "{what} not found: {hash}"),
        }
    }
}

impl std::error::Error for StoreError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(e) => Some(e),
            Self::Sqlite(e) => Some(e),
            Self::NotFound { .. } => None,
        }
    }
}

impl From<std::io::Error> for StoreError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

impl From<rusqlite::Error> for StoreError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Sqlite(e)
    }
}

pub type Result<T> = std::result::Result<T, StoreError>;

// ---------------------------------------------------------------------------
// Store configuration
// ---------------------------------------------------------------------------

/// How to find (or create) a store on disk.
#[derive(Debug, Clone)]
pub struct StoreConfig {
    /// Override store path (highest priority). Set by `--store` CLI flag.
    pub path: Option<PathBuf>,
}

impl StoreConfig {
    /// Resolve the store root directory.
    ///
    /// Priority: `path` field → `HOD_STORE` env → `$XDG_DATA_HOME/hod/`
    pub fn resolve(&self) -> PathBuf {
        if let Some(p) = &self.path {
            return p.clone();
        }
        if let Ok(p) = std::env::var("HOD_STORE") {
            return PathBuf::from(p);
        }
        let data_home = std::env::var("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
                PathBuf::from(home).join(".local/share")
            });
        data_home.join("hod")
    }
}

// ---------------------------------------------------------------------------
// Store handle
// ---------------------------------------------------------------------------

/// An open store handle. Owns the SQLite connection and knows the root path.
pub struct Store {
    /// Absolute path to the store root directory.
    root: PathBuf,
    /// SQLite connection to `hod.db`.
    conn: Connection,
}

impl Store {
    /// Open (or create) a store at the given path.
    ///
    /// Creates the directory structure and runs database migrations.
    pub fn open(config: &StoreConfig) -> Result<Self> {
        let root = config.resolve();
        Self::open_at(&root)
    }

    /// Open (or create) a store at an explicit path. Useful for testing.
    pub fn open_at(root: &Path) -> Result<Self> {
        // Create directory structure
        let dirs = ["blobs", "recipes", "outputs", "staging", "tmp"];
        for dir in &dirs {
            std::fs::create_dir_all(root.join(dir))?;
        }

        // Open SQLite
        let db_path = root.join("hod.db");
        let conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        db::migrate(&conn)?;

        Ok(Self {
            root: root.canonicalize().unwrap_or_else(|_| root.to_path_buf()),
            conn,
        })
    }

    /// The store root path.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// A reference to the SQLite connection.
    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    // -- Blob operations (delegate to blobs module) --

    /// Write a blob. Returns its BLAKE3 hash. Deduplicates automatically.
    pub fn write_blob(&self, data: &[u8]) -> Result<Hash> {
        blobs::write(self, data)
    }

    /// Read a blob by hash.
    pub fn read_blob(&self, hash: &Hash) -> Result<Vec<u8>> {
        blobs::read(self, hash)
    }

    /// Check if a blob exists.
    pub fn blob_exists(&self, hash: &Hash) -> Result<bool> {
        blobs::exists(self, hash)
    }

    // -- Recipe storage (delegate to recipes module) --

    /// Store a raw recipe binary. Returns its BLAKE3 hash.
    pub fn store_recipe(&self, bytes: &[u8]) -> Result<Hash> {
        recipes::store(self, bytes)
    }

    /// Read a raw recipe binary by hash.
    pub fn get_recipe(&self, hash: &Hash) -> Result<Vec<u8>> {
        recipes::get(self, hash)
    }

    /// Check if a recipe exists in the store.
    pub fn recipe_exists(&self, hash: &Hash) -> Result<bool> {
        recipes::exists(self, hash)
    }

    // -- Output storage --

    /// Record a build output: maps `recipe_hash` → `output_hash`.
    pub fn store_output(
        &self,
        recipe_hash: &Hash,
        output_hash: &Hash,
        build_ms: u64,
    ) -> Result<()> {
        let hex_recipe = hash_to_hex(recipe_hash);
        let hex_output = hash_to_hex(output_hash);
        let now = now_iso8601();
        self.conn.execute(
            "INSERT OR REPLACE INTO outputs (recipe_hash, output_hash, built_at, build_ms)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![hex_recipe, hex_output, now, build_ms as i64],
        )?;
        Ok(())
    }

    /// Look up a cached output hash by recipe hash. Returns `None` if not built yet.
    pub fn get_output(&self, recipe_hash: &Hash) -> Result<Option<Hash>> {
        let hex_recipe = hash_to_hex(recipe_hash);
        let mut stmt = self
            .conn
            .prepare("SELECT output_hash FROM outputs WHERE recipe_hash = ?1")?;
        let mut rows = stmt.query(rusqlite::params![hex_recipe])?;
        match rows.next()? {
            Some(row) => {
                let hex_output: String = row.get(0)?;
                let h = crate::hash::hex_to_hash(&hex_output).ok_or_else(|| {
                    StoreError::Io(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        format!("corrupt output hash in DB: {hex_output}"),
                    ))
                })?;
                Ok(Some(h))
            }
            None => Ok(None),
        }
    }

    /// Record a build log.
    pub fn store_build_log(
        &self,
        recipe_hash: &Hash,
        stdout_blob: Option<&Hash>,
        stderr_blob: Option<&Hash>,
        exit_code: i32,
    ) -> Result<()> {
        let hex_recipe = hash_to_hex(recipe_hash);
        let stdout_hex = stdout_blob.map(hash_to_hex);
        let stderr_hex = stderr_blob.map(hash_to_hex);
        let now = now_iso8601();
        self.conn.execute(
            "INSERT OR REPLACE INTO build_logs (recipe_hash, stdout_blob, stderr_blob, exit_code, built_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![hex_recipe, stdout_hex, stderr_hex, exit_code, now],
        )?;
        Ok(())
    }

    /// Retrieve a build log.
    pub fn get_build_log(&self, recipe_hash: &Hash) -> Result<Option<BuildLog>> {
        let hex_recipe = hash_to_hex(recipe_hash);
        let mut stmt = self.conn.prepare(
            "SELECT stdout_blob, stderr_blob, exit_code, built_at FROM build_logs WHERE recipe_hash = ?1"
        )?;
        let mut rows = stmt.query(rusqlite::params![hex_recipe])?;
        match rows.next()? {
            Some(row) => {
                let stdout_hex: Option<String> = row.get(0)?;
                let stderr_hex: Option<String> = row.get(1)?;
                let exit_code: i32 = row.get(2)?;
                let built_at: String = row.get(3)?;
                Ok(Some(BuildLog {
                    stdout_blob: stdout_hex.and_then(|h| crate::hash::hex_to_hash(&h)),
                    stderr_blob: stderr_hex.and_then(|h| crate::hash::hex_to_hash(&h)),
                    exit_code,
                    built_at,
                }))
            }
            None => Ok(None),
        }
    }

    /// Record dependency edges for a recipe.
    pub fn store_dependencies(
        &self,
        recipe_hash: &Hash,
        deps: &[(Option<String>, Hash)],
    ) -> Result<()> {
        let hex_recipe = hash_to_hex(recipe_hash);
        // Clear old deps for this recipe (idempotent)
        self.conn.execute(
            "DELETE FROM dependencies WHERE recipe_hash = ?1",
            rusqlite::params![hex_recipe],
        )?;
        for (name, dep_hash) in deps {
            let hex_dep = hash_to_hex(dep_hash);
            self.conn.execute(
                "INSERT INTO dependencies (recipe_hash, dep_hash, dep_name) VALUES (?1, ?2, ?3)",
                rusqlite::params![hex_recipe, hex_dep, name],
            )?;
        }
        Ok(())
    }

    /// Get all dependencies for a recipe.
    pub fn get_dependencies(&self, recipe_hash: &Hash) -> Result<Vec<(Option<String>, Hash)>> {
        let hex_recipe = hash_to_hex(recipe_hash);
        let mut stmt = self
            .conn
            .prepare("SELECT dep_hash, dep_name FROM dependencies WHERE recipe_hash = ?1")?;
        let mut rows = stmt.query(rusqlite::params![hex_recipe])?;
        let mut deps = Vec::new();
        while let Some(row) = rows.next()? {
            let hex_dep: String = row.get(0)?;
            let name: Option<String> = row.get(1)?;
            let hash = crate::hash::hex_to_hash(&hex_dep).ok_or_else(|| {
                StoreError::Io(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("corrupt dep hash in DB: {hex_dep}"),
                ))
            })?;
            deps.push((name, hash));
        }
        Ok(deps)
    }

    /// List all recipe hashes in the store.
    ///
    /// Returns `Vec<(hex_hash, Hash)>` for every stored recipe.
    pub fn list_recipes(&self) -> Result<Vec<(String, Hash)>> {
        let mut stmt = self
            .conn
            .prepare("SELECT recipe_hash FROM recipes ORDER BY stored_at")?;
        let mut rows = stmt.query([])?;
        let mut recipes = Vec::new();
        while let Some(row) = rows.next()? {
            let hex: String = row.get(0)?;
            let hash = crate::hash::hex_to_hash(&hex).ok_or_else(|| {
                StoreError::Io(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("corrupt recipe hash in DB: {hex}"),
                ))
            })?;
            recipes.push((hex, hash));
        }
        Ok(recipes)
    }

    // -- Path helpers --

    /// Path to the blobs directory.
    pub fn blobs_dir(&self) -> PathBuf {
        self.root.join("blobs")
    }

    /// Path to the recipes directory.
    pub fn recipes_dir(&self) -> PathBuf {
        self.root.join("recipes")
    }

    /// Path to the staging directory.
    pub fn staging_dir(&self) -> PathBuf {
        self.root.join("staging")
    }

    /// Path to the tmp directory.
    pub fn tmp_dir(&self) -> PathBuf {
        self.root.join("tmp")
    }
}

// ---------------------------------------------------------------------------
// Build log data
// ---------------------------------------------------------------------------

/// A stored build log entry.
#[derive(Debug, Clone)]
pub struct BuildLog {
    pub stdout_blob: Option<Hash>,
    pub stderr_blob: Option<Hash>,
    pub exit_code: i32,
    pub built_at: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_iso8601() -> String {
    // Simple ISO 8601 timestamp without pulling in chrono
    let duration = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    // Format as "YYYY-MM-DDTHH:MM:SSZ" (UTC, no sub-second precision needed)
    let days_since_epoch = secs / 86400;
    let time_of_day = secs % 86400;
    let (year, month, day) = days_to_ymd(days_since_epoch);
    let hour = time_of_day / 3600;
    let minute = (time_of_day % 3600) / 60;
    let second = time_of_day % 60;
    format!(
        "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z"
    )
}

/// Convert days since Unix epoch to (year, month, day).
fn days_to_ymd(mut days: u64) -> (u64, u64, u64) {
    // Algorithm from http://howardhinnant.github.io/date_algorithms.html
    days += 719468; // shift to days since 0000-03-01
    let era = days / 146097;
    let doe = days - era * 146097; // day of era [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // year of era [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // day of year [0, 365]
    let mp = (5 * doy + 2) / 153; // month [0, 11] (March = 0)
    let d = doy - (153 * mp + 2) / 5 + 1; // day [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // month [1, 12]
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}
