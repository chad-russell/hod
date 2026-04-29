//! BLAKE3 hashing utilities for content addressing.
//!
//! Every hash in Hod is BLAKE3 — recipe identity, blob content, artifact hashes.

use blake3::Hasher;

/// A BLAKE3 hash digest (32 bytes).
pub type Hash = [u8; 32];

/// Compute the BLAKE3 hash of arbitrary bytes.
pub fn hash_bytes(data: &[u8]) -> Hash {
    *Hasher::new().update(data).finalize().as_bytes()
}

/// Format a hash as lowercase hex.
pub fn hash_to_hex(hash: &Hash) -> String {
    hex::encode(hash)
}

/// Parse a 64-character hex string into a Hash.
pub fn hex_to_hash(hex_str: &str) -> Option<Hash> {
    hex::decode(hex_str).ok().and_then(|bytes| {
        if bytes.len() == 32 {
            let mut h = [0u8; 32];
            h.copy_from_slice(&bytes);
            Some(h)
        } else {
            None
        }
    })
}

/// Get the first 2 hex characters of a hash as a UTF-8 string, for filesystem sharding.
///
/// Returns e.g. `"a3"` — used to split blobs/recipes/outputs into subdirectories
/// to avoid millions of entries in a single directory.
pub fn hash_shard(hash: &Hash) -> String {
    hash_to_hex(hash)[..2].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_deterministic() {
        let data = b"hello, hod!";
        let h1 = hash_bytes(data);
        let h2 = hash_bytes(data);
        assert_eq!(h1, h2);
    }

    #[test]
    fn hash_different_inputs() {
        let h1 = hash_bytes(b"foo");
        let h2 = hash_bytes(b"bar");
        assert_ne!(h1, h2);
    }

    #[test]
    fn hash_hex_roundtrip() {
        let h = hash_bytes(b"test data");
        let hex = hash_to_hex(&h);
        assert_eq!(hex.len(), 64);
        let h2 = hex_to_hash(&hex).unwrap();
        assert_eq!(h, h2);
    }

    #[test]
    fn hex_to_hash_rejects_bad_input() {
        assert!(hex_to_hash("not hex").is_none());
        assert!(hex_to_hash("abcd").is_none()); // too short
        assert!(hex_to_hash(&"a".repeat(65)).is_none()); // too long
    }

    #[test]
    fn hash_shard_produces_hex_chars() {
        let h = hash_bytes(b"anything");
        let shard = hash_shard(&h);
        assert_eq!(shard.len(), 2);
        assert!(shard.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
