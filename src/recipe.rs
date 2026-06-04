//! Recipe types, binary encoding/decoding, and content hashing.
//!
//! Every `.hod` file is a self-contained binary record with this envelope:
//!
//! ```text
//! "HOD" (3 bytes) | version (u8) | type (u8) | body_len (u32 LE) | body
//! ```
//!
//! The recipe hash is computed externally as `blake3(envelope + body)` — it is
//! never stored in the file. There is exactly one valid binary encoding for
//! each recipe (deterministic by construction).

use serde::{Deserialize, Serialize};

use crate::encoding::{Decoder, EncodeError, Encoder};

/// Convenience alias for recipe decode results.
pub type Result<T> = std::result::Result<T, EncodeError>;
use crate::hash::{hash_bytes, Hash};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// File magic bytes — every `.hod` file starts with `"HOD"`.
pub const MAGIC: &[u8; 3] = b"HOD";

/// Current format version.
pub const VERSION: u8 = 0x00;

// ---------------------------------------------------------------------------
// Recipe type tags
// ---------------------------------------------------------------------------

/// Discriminant byte that appears in the envelope.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum RecipeType {
    File = 0x01,
    Directory = 0x02,
    Symlink = 0x03,
    Download = 0x04,
    Process = 0x05,
    Unpack = 0x06,
    GitFetch = 0x07,
}

impl RecipeType {
    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            0x01 => Some(Self::File),
            0x02 => Some(Self::Directory),
            0x03 => Some(Self::Symlink),
            0x04 => Some(Self::Download),
            0x05 => Some(Self::Process),
            0x06 => Some(Self::Unpack),
            0x07 => Some(Self::GitFetch),
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// Recipe data types
// ---------------------------------------------------------------------------

/// A file with known content.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecipeFile {
    /// BLAKE3 hash of the file's contents (stored as a blob).
    #[serde(with = "hash_serde")]
    pub content_blob_hash: Hash,
    /// Whether the file should be marked executable.
    pub executable: bool,
    /// Optional: hash of a Directory recipe providing packed resources.
    #[serde(
        skip_serializing_if = "Option::is_none",
        default,
        with = "option_hash_serde"
    )]
    pub resources_hash: Option<Hash>,
}

/// A single named entry inside a directory.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DirectoryEntry {
    /// Entry filename (UTF-8, sorted lexicographically with siblings).
    pub name: String,
    /// BLAKE3 hash of the recipe that produces this entry.
    #[serde(with = "hash_serde")]
    pub entry_hash: Hash,
}

/// A directory with named entries (sorted by name).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecipeDirectory {
    /// Entries sorted lexicographically by name.
    pub entries: Vec<DirectoryEntry>,
}

/// A symbolic link.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecipeSymlink {
    /// Symlink target (relative path).
    pub target: String,
}

/// A download recipe — fetch a URL with a known content hash.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecipeDownload {
    /// URL to fetch.
    pub url: String,
    /// Hash algorithm used for verification.
    pub hash_algorithm: HashAlgorithm,
    /// Expected hash of the fetched content.
    #[serde(with = "hash_serde")]
    pub expected_hash: Hash,
}

/// Hash algorithms supported by Download recipes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum HashAlgorithm {
    #[serde(rename = "blake3")]
    Blake3 = 0x01,
}

impl HashAlgorithm {
    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            0x01 => Some(Self::Blake3),
            _ => None,
        }
    }
}

/// Archive format for Unpack recipes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum ArchiveFormat {
    #[serde(rename = "tar_gz")]
    TarGz = 0x01,
    #[serde(rename = "tar_xz")]
    TarXz = 0x02,
    #[serde(rename = "tar_bz2")]
    TarBz2 = 0x03,
    #[serde(rename = "zip")]
    Zip = 0x04,
}

impl ArchiveFormat {
    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            0x01 => Some(Self::TarGz),
            0x02 => Some(Self::TarXz),
            0x03 => Some(Self::TarBz2),
            0x04 => Some(Self::Zip),
            _ => None,
        }
    }
}

/// A git fetch recipe — clone a git repository at a known revision.
///
/// Analogous to Nix's `builtins.fetchGit`. Produces a directory tree output
/// (the working tree at the specified revision, without `.git` metadata).
/// The output hash is verified against `expected_hash` for hermeticity.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecipeGitFetch {
    /// Git repository URL (HTTPS or SSH).
    pub url: String,
    /// Revision to checkout — commit hash, tag, or branch name.
    pub revision: String,
    /// Expected BLAKE3 hash of the output directory tree.
    #[serde(with = "hash_serde")]
    pub expected_hash: Hash,
}

/// An unpack recipe — extract a tar archive into a directory output.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecipeUnpack {
    /// BLAKE3 hash of the archive blob.
    #[serde(with = "hash_serde")]
    pub archive_hash: Hash,
    /// Archive format (tar_gz or tar_xz).
    pub format: ArchiveFormat,
    /// Optional: recipe hash of a Download recipe that produces the archive blob.
    /// When set, the build system will build the Download first (ensuring the
    /// blob is in the store) before extracting. This is a backward-compatible
    /// tail field: absent in older recipes.
    #[serde(
        skip_serializing_if = "Option::is_none",
        default,
        with = "option_hash_serde"
    )]
    pub archive_recipe_hash: Option<Hash>,
    /// Number of leading path components to strip during extraction.
    /// Equivalent to `tar --strip-components=N`. Default is 0 (no stripping).
    /// Backward-compatible tail field: absent in older recipes means 0.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub strip_components: Option<u8>,
}

/// A named dependency in a Process recipe.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProcessDependency {
    /// Dependency name (e.g. `"bash"`). Mounted at `/deps/<name>/` in the sandbox.
    pub name: String,
    /// BLAKE3 hash of the dependency recipe.
    #[serde(with = "hash_serde")]
    pub recipe_hash: Hash,
}

/// An environment variable in a Process recipe.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

/// A process recipe — run a command in a sandbox.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecipeProcess {
    /// Target platform, e.g. `"x86_64-linux"`.
    pub platform: String,
    /// Command to execute (resolved within deps).
    pub command: String,
    /// Command-line arguments.
    pub args: Vec<String>,
    /// Environment variables, sorted by key.
    pub env: Vec<EnvVar>,
    /// Named dependencies, sorted by name.
    pub dependencies: Vec<ProcessDependency>,
    /// Optional working directory contents.
    #[serde(
        skip_serializing_if = "Option::is_none",
        default,
        with = "option_hash_serde"
    )]
    pub workdir_hash: Option<Hash>,
    /// Optional initial output directory contents.
    #[serde(
        skip_serializing_if = "Option::is_none",
        default,
        with = "option_hash_serde"
    )]
    pub output_scaffold_hash: Option<Hash>,
    /// Bitmask of unsafe flags. Bit 0 = allow networking.
    pub unsafe_flags: u8,
    /// Optional list of dependencies needed at runtime for store-relative ELF relocation.
    ///
    /// Each name must be a subset of `dependencies`. When present, the builder
    /// scans ELF binaries in the output, resolves DT_NEEDED against these deps,
    /// and patches RUNPATH + bootstrap interpreter paths with store-relative paths.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub runtime_deps: Option<Vec<String>>,
}

/// The top-level recipe enum — one of the recipe types.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Recipe {
    File(RecipeFile),
    Directory(RecipeDirectory),
    Symlink(RecipeSymlink),
    Download(RecipeDownload),
    Process(RecipeProcess),
    Unpack(RecipeUnpack),
    GitFetch(RecipeGitFetch),
}

impl Recipe {
    /// Return the type tag for this recipe variant.
    pub fn recipe_type(&self) -> RecipeType {
        match self {
            Self::File(_) => RecipeType::File,
            Self::Directory(_) => RecipeType::Directory,
            Self::Symlink(_) => RecipeType::Symlink,
            Self::Download(_) => RecipeType::Download,
            Self::Process(_) => RecipeType::Process,
            Self::Unpack(_) => RecipeType::Unpack,
            Self::GitFetch(_) => RecipeType::GitFetch,
        }
    }

    // -----------------------------------------------------------------------
    // Encoding
    // -----------------------------------------------------------------------

    /// Encode the full binary envelope (magic + version + type + body_len + body).
    pub fn encode(&self) -> Vec<u8> {
        let body = self.encode_body();
        let mut enc = Encoder::new();
        enc.reserve(3 + 1 + 1 + 4 + body.len());
        // Envelope header
        enc.u8(MAGIC[0]);
        enc.u8(MAGIC[1]);
        enc.u8(MAGIC[2]);
        enc.u8(VERSION);
        enc.u8(self.recipe_type() as u8);
        enc.u32_le(body.len() as u32);
        // Body
        enc.as_bytes_mut().extend_from_slice(&body);
        enc.into_bytes()
    }

    /// Compute the BLAKE3 hash of the full binary envelope.
    pub fn recipe_hash(&self) -> Hash {
        hash_bytes(&self.encode())
    }

    /// Encode only the type-specific body.
    fn encode_body(&self) -> Vec<u8> {
        let mut enc = Encoder::new();
        match self {
            Recipe::File(f) => {
                enc.hash(&f.content_blob_hash);
                enc.u8(if f.executable { 0x01 } else { 0x00 });
                enc.optional(f.resources_hash.as_ref(), |e, h| e.hash(h));
            }
            Recipe::Directory(d) => {
                enc.list_u32(&d.entries, |e, entry| {
                    e.str_u16(&entry.name);
                    e.hash(&entry.entry_hash);
                });
            }
            Recipe::Symlink(s) => {
                enc.str_u16(&s.target);
            }
            Recipe::Download(dl) => {
                enc.str_u16(&dl.url);
                enc.u8(dl.hash_algorithm as u8);
                enc.hash(&dl.expected_hash);
            }
            Recipe::Unpack(u) => {
                enc.hash(&u.archive_hash);
                enc.u8(u.format as u8);
                // Backward-compatible tail extension: only written when present.
                let has_archive_recipe = u.archive_recipe_hash.is_some();
                let has_strip = u.strip_components.is_some();
                if has_archive_recipe || has_strip {
                    // archive_recipe_hash: presence byte + optional hash
                    match &u.archive_recipe_hash {
                        Some(h) => {
                            enc.u8(0x01);
                            enc.hash(h);
                        }
                        None => enc.u8(0x00),
                    }
                    // strip_components: presence byte + optional u8
                    match u.strip_components {
                        Some(n) => {
                            enc.u8(0x01);
                            enc.u8(n);
                        }
                        None => enc.u8(0x00),
                    }
                }
            }
            Recipe::Process(p) => {
                enc.str_u16(&p.platform);
                enc.str_u16(&p.command);
                enc.list_u32(&p.args, |e, arg| e.str_u16(arg));
                enc.list_u32(&p.env, |e, var| {
                    e.str_u16(&var.key);
                    e.str_u16(&var.value);
                });
                enc.list_u32(&p.dependencies, |e, dep| {
                    e.str_u16(&dep.name);
                    e.hash(&dep.recipe_hash);
                });
                enc.optional(p.workdir_hash.as_ref(), |e, h| e.hash(h));
                enc.optional(p.output_scaffold_hash.as_ref(), |e, h| e.hash(h));
                enc.u8(p.unsafe_flags);
                // Backward-compatible tail extension: omitted when absent so
                // legacy Process recipe bytes/hashes remain unchanged. When
                // present, write a presence byte followed by the sorted list.
                if let Some(runtime_deps) = p.runtime_deps.as_ref() {
                    enc.u8(0x01);
                    enc.list_u32(runtime_deps, |e, dep| e.str_u16(dep));
                }
            }
            Recipe::GitFetch(gf) => {
                enc.str_u16(&gf.url);
                enc.str_u16(&gf.revision);
                enc.hash(&gf.expected_hash);
            }
        }
        enc.into_bytes()
    }

    // -----------------------------------------------------------------------
    // Decoding
    // -----------------------------------------------------------------------

    /// Decode a recipe from its full binary envelope.
    pub fn decode(bytes: &[u8]) -> Result<Self> {
        let mut dec = Decoder::new(bytes);

        // Magic
        let m0 = dec.u8()?;
        let m1 = dec.u8()?;
        let m2 = dec.u8()?;
        if [m0, m1, m2] != *MAGIC {
            return Err(EncodeError::InvalidMagic {
                expected: String::from_utf8_lossy(MAGIC).into_owned(),
                got: format!("0x{m0:02x} 0x{m1:02x} 0x{m2:02x}"),
            });
        }

        // Version
        let version = dec.u8()?;
        if version != VERSION {
            return Err(EncodeError::InvalidVersion {
                expected: VERSION,
                got: version,
            });
        }

        // Type tag
        let type_tag = dec.u8()?;
        let recipe_type = RecipeType::from_u8(type_tag).ok_or(EncodeError::InvalidValue {
            field: "recipe type tag".into(),
            value: format!("0x{type_tag:02x}"),
        })?;

        // Body length
        let body_len = dec.u32_le()? as usize;

        // Extract body slice — must be exactly body_len bytes
        let body = dec.read_bytes(body_len)?;

        // No trailing data after body
        dec.finish()?;

        // Decode body
        let mut body_dec = Decoder::new(body);
        let recipe = match recipe_type {
            RecipeType::File => Self::decode_file(&mut body_dec)?,
            RecipeType::Directory => Self::decode_directory(&mut body_dec)?,
            RecipeType::Symlink => Self::decode_symlink(&mut body_dec)?,
            RecipeType::Download => Self::decode_download(&mut body_dec)?,
            RecipeType::Process => Self::decode_process(&mut body_dec)?,
            RecipeType::Unpack => Self::decode_unpack(&mut body_dec)?,
            RecipeType::GitFetch => Self::decode_git_fetch(&mut body_dec)?,
        };

        // Body must be fully consumed
        body_dec.finish()?;

        Ok(recipe)
    }

    fn decode_file(dec: &mut Decoder) -> Result<Self> {
        let content_blob_hash = dec.hash()?;
        let executable = match dec.u8()? {
            0x00 => false,
            0x01 => true,
            v => {
                return Err(EncodeError::InvalidValue {
                    field: "file executable".into(),
                    value: format!("expected 0x00 or 0x01, got 0x{v:02x}"),
                })
            }
        };
        let resources_hash = dec.optional(|d| d.hash())?;
        Ok(Recipe::File(RecipeFile {
            content_blob_hash,
            executable,
            resources_hash,
        }))
    }

    fn decode_directory(dec: &mut Decoder) -> Result<Self> {
        let entries = dec.list_u32(|d| {
            let name = d.str_u16()?;
            let entry_hash = d.hash()?;
            Ok(DirectoryEntry { name, entry_hash })
        })?;
        // Validate sorted order
        for window in entries.windows(2) {
            if window[0].name >= window[1].name {
                return Err(EncodeError::InvalidSortOrder {
                    field: "directory entries".into(),
                    first: window[0].name.clone(),
                    second: window[1].name.clone(),
                });
            }
        }
        Ok(Recipe::Directory(RecipeDirectory { entries }))
    }

    fn decode_symlink(dec: &mut Decoder) -> Result<Self> {
        let target = dec.str_u16()?;
        Ok(Recipe::Symlink(RecipeSymlink { target }))
    }

    fn decode_download(dec: &mut Decoder) -> Result<Self> {
        let url = dec.str_u16()?;
        let hash_algo_tag = dec.u8()?;
        let hash_algorithm =
            HashAlgorithm::from_u8(hash_algo_tag).ok_or(EncodeError::InvalidValue {
                field: "hash algorithm".into(),
                value: format!("0x{hash_algo_tag:02x}"),
            })?;
        let expected_hash = dec.hash()?;
        Ok(Recipe::Download(RecipeDownload {
            url,
            hash_algorithm,
            expected_hash,
        }))
    }

    fn decode_unpack(dec: &mut Decoder) -> Result<Self> {
        let archive_hash = dec.hash()?;
        let format_tag = dec.u8()?;
        let format = ArchiveFormat::from_u8(format_tag).ok_or(EncodeError::InvalidValue {
            field: "archive format".into(),
            value: format!("0x{format_tag:02x}"),
        })?;
        // Backward-compatible tail fields: absent in older recipes.
        let (archive_recipe_hash, strip_components) = if dec.remaining() == 0 {
            (None, None)
        } else {
            let arh = match dec.u8()? {
                0x00 => None,
                0x01 => Some(dec.hash()?),
                v => {
                    return Err(EncodeError::InvalidValue {
                        field: "unpack archive_recipe_hash presence byte".into(),
                        value: format!("expected 0x00 or 0x01, got 0x{v:02x}"),
                    });
                }
            };
            let strip = if dec.remaining() == 0 {
                None
            } else {
                match dec.u8()? {
                    0x00 => None,
                    0x01 => Some(dec.u8()?),
                    v => {
                        return Err(EncodeError::InvalidValue {
                            field: "unpack strip_components presence byte".into(),
                            value: format!("expected 0x00 or 0x01, got 0x{v:02x}"),
                        });
                    }
                }
            };
            (arh, strip)
        };
        Ok(Recipe::Unpack(RecipeUnpack {
            archive_hash,
            format,
            archive_recipe_hash,
            strip_components,
        }))
    }

    fn decode_process(dec: &mut Decoder) -> Result<Self> {
        let platform = dec.str_u16()?;
        let command = dec.str_u16()?;
        let args = dec.list_u32(|d| d.str_u16())?;
        let env = dec.list_u32(|d| {
            let key = d.str_u16()?;
            let value = d.str_u16()?;
            Ok(EnvVar { key, value })
        })?;
        let dependencies = dec.list_u32(|d| {
            let name = d.str_u16()?;
            let recipe_hash = d.hash()?;
            Ok(ProcessDependency { name, recipe_hash })
        })?;
        let workdir_hash = dec.optional(|d| d.hash())?;
        let output_scaffold_hash = dec.optional(|d| d.hash())?;
        let unsafe_flags = dec.u8()?;
        let runtime_deps = if dec.remaining() == 0 {
            None
        } else {
            // Backward/transition compatibility: some checked-in recipes predate
            // this tail field entirely, while others encode it as a normal
            // optional (0x00 absent, 0x01 present + list).
            match dec.u8()? {
                0x00 => None,
                0x01 => Some(dec.list_u32(|d| d.str_u16())?),
                v => {
                    return Err(EncodeError::InvalidValue {
                        field: "process runtime_deps presence byte".into(),
                        value: format!("expected 0x00 or 0x01, got 0x{v:02x}"),
                    });
                }
            }
        };

        // Validate env sorted by key
        for window in env.windows(2) {
            if window[0].key >= window[1].key {
                return Err(EncodeError::InvalidSortOrder {
                    field: "process env vars".into(),
                    first: window[0].key.clone(),
                    second: window[1].key.clone(),
                });
            }
        }

        // Validate dependencies sorted by name
        for window in dependencies.windows(2) {
            if window[0].name >= window[1].name {
                return Err(EncodeError::InvalidSortOrder {
                    field: "process dependencies".into(),
                    first: window[0].name.clone(),
                    second: window[1].name.clone(),
                });
            }
        }

        // Validate runtime_deps sorted by name when present.
        if let Some(ref deps) = runtime_deps {
            for window in deps.windows(2) {
                if window[0] >= window[1] {
                    return Err(EncodeError::InvalidSortOrder {
                        field: "process runtime_deps".into(),
                        first: window[0].clone(),
                        second: window[1].clone(),
                    });
                }
            }
        }

        Ok(Recipe::Process(RecipeProcess {
            platform,
            command,
            args,
            env,
            dependencies,
            workdir_hash,
            output_scaffold_hash,
            unsafe_flags,
            runtime_deps,
        }))
    }

    fn decode_git_fetch(dec: &mut Decoder) -> Result<Self> {
        let url = dec.str_u16()?;
        let revision = dec.str_u16()?;
        let expected_hash = dec.hash()?;
        Ok(Recipe::GitFetch(RecipeGitFetch {
            url,
            revision,
            expected_hash,
        }))
    }
}

// ---------------------------------------------------------------------------
// Serde helpers for Hash → hex string
// ---------------------------------------------------------------------------

mod hash_serde {
    use crate::hash::{hash_to_hex, hex_to_hash, Hash};
    use serde::{de, Deserialize as _, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(hash: &Hash, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&hash_to_hex(hash))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Hash, D::Error> {
        let s = String::deserialize(d)?;
        hex_to_hash(&s).ok_or_else(|| de::Error::custom("invalid hash: expected 64 hex characters"))
    }
}

mod option_hash_serde {
    use crate::hash::{hash_to_hex, hex_to_hash, Hash};
    use serde::{de, Deserialize as _, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(opt: &Option<Hash>, s: S) -> Result<S::Ok, S::Error> {
        match opt {
            Some(h) => s.serialize_str(&hash_to_hex(h)),
            None => s.serialize_none(),
        }
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Option<Hash>, D::Error> {
        match Option::<String>::deserialize(d)? {
            Some(s) => hex_to_hash(&s)
                .map(Some)
                .ok_or_else(|| de::Error::custom("invalid hash: expected 64 hex characters")),
            None => Ok(None),
        }
    }
}
