//! Download recipe builder — fetch a URL and verify its content hash.
//!
//! Uses `curl` as an external process to fetch URLs. This avoids adding a
//! heavy HTTP dependency (reqwest) while still providing download support.
//! The builder:
//!   1. Spawns `curl` to fetch the URL
//!   2. Verifies the content hash against the expected hash
//!   3. Stores the result as a blob in the store
//!   4. Returns a File artifact

use crate::build::{Artifact, BuildError, Result};
use crate::hash::{hash_bytes, hash_to_hex};

/// Build a Download recipe: fetch the URL, verify hash, store as blob.
pub fn build_download(
    store: &crate::store::Store,
    dl: &crate::recipe::RecipeDownload,
) -> Result<Artifact> {
    // Fetch via curl
    let output = std::process::Command::new("curl")
        .args(["-sL", "--fail", &dl.url])
        .output()
        .map_err(|e| {
            BuildError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("failed to spawn curl: {e}. Is curl installed?"),
            ))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(BuildError::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("curl failed for {}: {}", dl.url, stderr.trim()),
        )));
    }

    let data = output.stdout;

    // Verify content hash
    let actual_hash = hash_bytes(&data);
    if actual_hash != dl.expected_hash {
        return Err(BuildError::HashMismatch {
            expected: dl.expected_hash,
            got: actual_hash,
        });
    }

    // Store as blob
    store.write_blob(&data)?;

    Ok(Artifact::File {
        content_hash: actual_hash,
        executable: false,
    })
}

/// Fetch a URL and return its BLAKE3 hash (for recipe generation helpers).
/// Does NOT store the blob — just computes the hash.
#[allow(dead_code)]
pub fn fetch_and_hash(url: &str) -> std::io::Result<crate::hash::Hash> {
    let output = std::process::Command::new("curl")
        .args(["-sL", "--fail", url])
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("curl failed for {}: {}", url, stderr.trim()),
        ));
    }

    Ok(hash_bytes(&output.stdout))
}

/// Download a URL to a file on disk (for recipe generation helpers).
/// Returns the content bytes.
#[allow(dead_code)]
pub fn download_to_file(url: &str, path: &std::path::Path) -> std::io::Result<Vec<u8>> {
    let output = std::process::Command::new("curl")
        .args(["-sL", "--fail", url])
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("curl failed for {}: {}", url, stderr.trim()),
        ));
    }

    std::fs::write(path, &output.stdout)?;
    Ok(output.stdout)
}

/// Format a hash for display (used in generated shell scripts).
#[allow(dead_code)]
pub fn format_hash(hash: &crate::hash::Hash) -> String {
    hash_to_hex(hash)
}
