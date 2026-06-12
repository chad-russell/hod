//! Round-trip encoding/decoding tests for all recipe types.
//!
//! Tests are organized by recipe type, then validation/rejection tests.

use hod::encoding::EncodeError;
use hod::hash::Hash;
use hod::hash::hash_bytes;
use hod::recipe::*;

// ===========================================================================
// Helpers
// ===========================================================================

/// A fixed hash used across tests — 32 bytes of 0xAB.
fn test_hash() -> Hash {
    [0xABu8; 32]
}

/// A different fixed hash — 32 bytes of 0xCD.
fn test_hash_b() -> Hash {
    [0xCDu8; 32]
}

/// A different fixed hash — 32 bytes of 0xEF.
fn test_hash_c() -> Hash {
    [0xEFu8; 32]
}

// ===========================================================================
// File recipe
// ===========================================================================

#[test]
fn roundtrip_file_basic() {
    let recipe = Recipe::File(RecipeFile {
        content_blob_hash: test_hash(),
        executable: false,
        resources_hash: None,
    });
    let bytes = recipe.encode();
    let decoded = Recipe::decode(&bytes).unwrap();
    assert_eq!(recipe, decoded);
}

#[test]
fn roundtrip_file_executable_with_resources() {
    let recipe = Recipe::File(RecipeFile {
        content_blob_hash: test_hash(),
        executable: true,
        resources_hash: Some(test_hash_b()),
    });
    let bytes = recipe.encode();
    let decoded = Recipe::decode(&bytes).unwrap();
    assert_eq!(recipe, decoded);
}

#[test]
fn file_binary_layout() {
    let recipe = Recipe::File(RecipeFile {
        content_blob_hash: test_hash(),
        executable: true,
        resources_hash: None,
    });
    let bytes = recipe.encode();

    // Envelope: "HOD" (3) + version (1) + type (1) + body_len (4) = 9 bytes header
    assert_eq!(&bytes[0..3], b"HOD");
    assert_eq!(bytes[3], 0x00); // version
    assert_eq!(bytes[4], 0x01); // File type tag

    // Body: hash (32) + executable (1) + has_resources (1) = 34 bytes
    let body_len = u32::from_le_bytes([bytes[5], bytes[6], bytes[7], bytes[8]]);
    assert_eq!(body_len, 34);

    // executable byte
    assert_eq!(bytes[9 + 32], 0x01);
    // has_resources = 0x00 (no)
    assert_eq!(bytes[9 + 33], 0x00);

    assert_eq!(bytes.len(), 9 + 34);
}

// ===========================================================================
// Directory recipe
// ===========================================================================

#[test]
fn roundtrip_directory_empty() {
    let recipe = Recipe::Directory(RecipeDirectory { entries: vec![] });
    let bytes = recipe.encode();
    let decoded = Recipe::decode(&bytes).unwrap();
    assert_eq!(recipe, decoded);
}

#[test]
fn roundtrip_directory_with_entries() {
    let recipe = Recipe::Directory(RecipeDirectory {
        entries: vec![
            DirectoryEntry {
                name: "bin".into(),
                entry_hash: test_hash(),
            },
            DirectoryEntry {
                name: "lib".into(),
                entry_hash: test_hash_b(),
            },
        ],
    });
    let bytes = recipe.encode();
    let decoded = Recipe::decode(&bytes).unwrap();
    assert_eq!(recipe, decoded);
}

#[test]
fn directory_entries_must_be_sorted() {
    let recipe = Recipe::Directory(RecipeDirectory {
        entries: vec![
            DirectoryEntry {
                name: "lib".into(),
                entry_hash: test_hash(),
            },
            DirectoryEntry {
                name: "bin".into(), // "lib" > "bin" — not sorted!
                entry_hash: test_hash_b(),
            },
        ],
    });
    let bytes = recipe.encode();
    let err = Recipe::decode(&bytes).unwrap_err();
    match err {
        EncodeError::InvalidSortOrder { field, first, second } => {
            assert_eq!(field, "directory entries");
            assert_eq!(first, "lib");
            assert_eq!(second, "bin");
        }
        other => panic!("expected InvalidSortOrder, got {other:?}"),
    }
}

// ===========================================================================
// Symlink recipe
// ===========================================================================

#[test]
fn roundtrip_symlink() {
    let recipe = Recipe::Symlink(RecipeSymlink {
        target: "../lib/libfoo.so".into(),
    });
    let bytes = recipe.encode();
    let decoded = Recipe::decode(&bytes).unwrap();
    assert_eq!(recipe, decoded);
}

// ===========================================================================
// Download recipe
// ===========================================================================

#[test]
fn roundtrip_download() {
    let recipe = Recipe::Download(RecipeDownload {
        url: "https://example.com/foo.tar.gz".into(),
        hash_algorithm: HashAlgorithm::Blake3,
        expected_hash: test_hash(),
    });
    let bytes = recipe.encode();
    let decoded = Recipe::decode(&bytes).unwrap();
    assert_eq!(recipe, decoded);
}

#[test]
fn download_type_tag() {
    let recipe = Recipe::Download(RecipeDownload {
        url: "https://example.com".into(),
        hash_algorithm: HashAlgorithm::Blake3,
        expected_hash: test_hash(),
    });
    let bytes = recipe.encode();
    assert_eq!(bytes[4], 0x04); // Download type tag
}

// ===========================================================================
// Process recipe
// ===========================================================================

#[test]
fn roundtrip_process_minimal() {
    let recipe = Recipe::Process(RecipeProcess {
        platform: "x86_64-linux".into(),
        command: "/deps/bash/bin/bash".into(),
        args: vec!["-c".into(), "echo hello > $OUT".into()],
        env: vec![],
        dependencies: vec![],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0x00,
        runtime_deps: None,
        runtime: None,
    });
    let bytes = recipe.encode();
    let decoded = Recipe::decode(&bytes).unwrap();
    assert_eq!(recipe, decoded);
}

#[test]
fn roundtrip_process_full() {
    let recipe = Recipe::Process(RecipeProcess {
        platform: "x86_64-linux".into(),
        command: "/deps/bash/bin/bash".into(),
        args: vec!["-c".into(), "/deps/hello-script/hello.sh > $OUT".into()],
        env: vec![
            EnvVar {
                key: "HOME".into(),
                value: "/homeless-shelter".into(),
            },
            EnvVar {
                key: "PATH".into(),
                value: "/deps/coreutils/bin".into(),
            },
        ],
        dependencies: vec![
            ProcessDependency {
                name: "bash".into(),
                recipe_hash: test_hash(),
            },
            ProcessDependency {
                name: "hello-script".into(),
                recipe_hash: test_hash_b(),
            },
        ],
        workdir_hash: Some(test_hash_c()),
        output_scaffold_hash: Some(test_hash()),
        unsafe_flags: 0x01, // allow networking
        runtime_deps: None,
        runtime: None,
    });
    let bytes = recipe.encode();
    let decoded = Recipe::decode(&bytes).unwrap();
    assert_eq!(recipe, decoded);
}

#[test]
fn process_env_must_be_sorted() {
    let recipe = Recipe::Process(RecipeProcess {
        platform: "x86_64-linux".into(),
        command: "/bin/true".into(),
        args: vec![],
        env: vec![
            EnvVar {
                key: "ZEBRA".into(),
                value: "1".into(),
            },
            EnvVar {
                key: "APPLE".into(),
                value: "2".into(),
            },
        ],
        dependencies: vec![],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0x00,
        runtime_deps: None,
        runtime: None,
    });
    let bytes = recipe.encode();
    let err = Recipe::decode(&bytes).unwrap_err();
    match err {
        EncodeError::InvalidSortOrder { field, first, second } => {
            assert_eq!(field, "process env vars");
            assert_eq!(first, "ZEBRA");
            assert_eq!(second, "APPLE");
        }
        other => panic!("expected InvalidSortOrder, got {other:?}"),
    }
}

#[test]
fn process_deps_must_be_sorted() {
    let recipe = Recipe::Process(RecipeProcess {
        platform: "x86_64-linux".into(),
        command: "/bin/true".into(),
        args: vec![],
        env: vec![],
        dependencies: vec![
            ProcessDependency {
                name: "zebra".into(),
                recipe_hash: test_hash(),
            },
            ProcessDependency {
                name: "apple".into(),
                recipe_hash: test_hash_b(),
            },
        ],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0x00,
        runtime_deps: None,
        runtime: None,
    });
    let bytes = recipe.encode();
    let err = Recipe::decode(&bytes).unwrap_err();
    match err {
        EncodeError::InvalidSortOrder { field, first, second } => {
            assert_eq!(field, "process dependencies");
            assert_eq!(first, "zebra");
            assert_eq!(second, "apple");
        }
        other => panic!("expected InvalidSortOrder, got {other:?}"),
    }
}

// ===========================================================================
// Determinism — same recipe always produces same bytes and same hash
// ===========================================================================

#[test]
fn determinism_same_recipe_same_bytes() {
    let recipe = Recipe::File(RecipeFile {
        content_blob_hash: test_hash(),
        executable: true,
        resources_hash: None,
    });
    let bytes1 = recipe.encode();
    let bytes2 = recipe.encode();
    assert_eq!(bytes1, bytes2);
}

#[test]
fn determinism_same_recipe_same_hash() {
    let recipe = Recipe::Process(RecipeProcess {
        platform: "x86_64-linux".into(),
        command: "/deps/bash/bin/bash".into(),
        args: vec!["-c".into(), "echo hi".into()],
        env: vec![EnvVar {
            key: "FOO".into(),
            value: "bar".into(),
        }],
        dependencies: vec![ProcessDependency {
            name: "bash".into(),
            recipe_hash: test_hash(),
        }],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0x00,
        runtime_deps: None,
        runtime: None,
    });
    let h1 = recipe.recipe_hash();
    let h2 = recipe.recipe_hash();
    assert_eq!(h1, h2);
}

// ===========================================================================
// Hash stability — golden test with hardcoded expected hash
// ===========================================================================

#[test]
fn hash_golden_file_recipe() {
    // A known recipe with a known hash. If this test breaks, the binary
    // format has changed — update the expected hash deliberately.
    let recipe = Recipe::File(RecipeFile {
        content_blob_hash: [0u8; 32], // all-zero hash
        executable: false,
        resources_hash: None,
    });
    let bytes = recipe.encode();
    let computed = hash_bytes(&bytes);

    // Compute the expected hash from the raw bytes to verify the golden value
    // Format: "HOD" + 0x00 + 0x01 + body_len(34 as u32 LE) + body
    // Body: [0u8;32] + 0x00 + 0x00
    let mut expected_bytes = vec![];
    expected_bytes.extend_from_slice(b"HOD"); // magic
    expected_bytes.push(0x00); // version
    expected_bytes.push(0x01); // type = File
    expected_bytes.extend_from_slice(&34u32.to_le_bytes()); // body_len
    expected_bytes.extend_from_slice(&[0u8; 32]); // content_blob_hash
    expected_bytes.push(0x00); // executable = false
    expected_bytes.push(0x00); // has_resources = no
    let expected_hash = hash_bytes(&expected_bytes);

    assert_eq!(bytes, expected_bytes);
    assert_eq!(computed, expected_hash);
}

// ===========================================================================
// Rejection / error tests
// ===========================================================================

#[test]
fn reject_bad_magic() {
    let mut bytes = Recipe::File(RecipeFile {
        content_blob_hash: test_hash(),
        executable: false,
        resources_hash: None,
    })
    .encode();
    // Corrupt the magic
    bytes[0] = b'X';
    let err = Recipe::decode(&bytes).unwrap_err();
    match err {
        EncodeError::InvalidMagic { expected, got } => {
            assert_eq!(expected, "HOD");
            assert!(got.contains("0x58")); // 'X' = 0x58
        }
        other => panic!("expected InvalidMagic, got {other:?}"),
    }
}

#[test]
fn reject_bad_version() {
    let mut bytes = Recipe::File(RecipeFile {
        content_blob_hash: test_hash(),
        executable: false,
        resources_hash: None,
    })
    .encode();
    bytes[3] = 0x99; // bad version
    let err = Recipe::decode(&bytes).unwrap_err();
    match err {
        EncodeError::InvalidVersion { expected, got } => {
            assert_eq!(expected, 0x00);
            assert_eq!(got, 0x99);
        }
        other => panic!("expected InvalidVersion, got {other:?}"),
    }
}

#[test]
fn reject_unknown_type_tag() {
    let mut bytes = Recipe::File(RecipeFile {
        content_blob_hash: test_hash(),
        executable: false,
        resources_hash: None,
    })
    .encode();
    bytes[4] = 0xFF; // invalid type tag
    let err = Recipe::decode(&bytes).unwrap_err();
    match err {
        EncodeError::InvalidValue { field, value } => {
            assert_eq!(field, "recipe type tag");
            assert_eq!(value, "0xff");
        }
        other => panic!("expected InvalidValue, got {other:?}"),
    }
}

#[test]
fn reject_body_len_too_large() {
    let mut bytes = Recipe::Symlink(RecipeSymlink {
        target: "foo".into(),
    })
    .encode();
    // Overstate the body length (actual body is 6 bytes: u16 len + "foo")
    bytes[5..9].copy_from_slice(&999u32.to_le_bytes());
    let err = Recipe::decode(&bytes).unwrap_err();
    match err {
        EncodeError::UnexpectedEof { what } => {
            assert!(what.contains("byte slice"));
        }
        other => panic!("expected UnexpectedEof, got {other:?}"),
    }
}

#[test]
fn reject_body_len_too_small() {
    let mut bytes = Recipe::Symlink(RecipeSymlink {
        target: "foo".into(),
    })
    .encode();
    // Understate the body length — will leave trailing bytes after body
    bytes[5..9].copy_from_slice(&1u32.to_le_bytes());
    let err = Recipe::decode(&bytes).unwrap_err();
    // After reading 1 byte of body, there will be trailing envelope data
    match err {
        EncodeError::TrailingBytes { .. } | EncodeError::UnexpectedEof { .. } => {}
        other => panic!("expected TrailingBytes or UnexpectedEof, got {other:?}"),
    }
}

#[test]
fn reject_trailing_bytes_after_envelope() {
    let mut bytes = Recipe::Symlink(RecipeSymlink {
        target: "x".into(),
    })
    .encode();
    bytes.push(0xFF); // extra trailing byte
    let err = Recipe::decode(&bytes).unwrap_err();
    match err {
        EncodeError::TrailingBytes { count } => assert_eq!(count, 1),
        other => panic!("expected TrailingBytes, got {other:?}"),
    }
}

#[test]
fn reject_trailing_bytes_in_body() {
    // Manually craft a File recipe body with one extra byte at the end
    let mut enc = hod::encoding::Encoder::new();
    enc.hash(&test_hash()); // content_blob_hash
    enc.u8(0x00); // executable
    enc.u8(0x00); // has_resources
    enc.u8(0xFF); // extra byte!
    let body = enc.into_bytes();

    let mut envelope = vec![];
    envelope.extend_from_slice(b"HOD");
    envelope.push(0x00); // version
    envelope.push(0x01); // type = File
    envelope.extend_from_slice(&(body.len() as u32).to_le_bytes());
    envelope.extend_from_slice(&body);

    let err = Recipe::decode(&envelope).unwrap_err();
    match err {
        EncodeError::TrailingBytes { count } => assert_eq!(count, 1),
        other => panic!("expected TrailingBytes, got {other:?}"),
    }
}

#[test]
fn reject_empty_input() {
    let err = Recipe::decode(&[]).unwrap_err();
    match err {
        EncodeError::UnexpectedEof { .. } => {}
        other => panic!("expected UnexpectedEof, got {other:?}"),
    }
}

// ===========================================================================
// RecipeType helpers
// ===========================================================================

#[test]
fn recipe_type_from_u8() {
    assert_eq!(RecipeType::from_u8(0x01), Some(RecipeType::File));
    assert_eq!(RecipeType::from_u8(0x02), Some(RecipeType::Directory));
    assert_eq!(RecipeType::from_u8(0x03), Some(RecipeType::Symlink));
    assert_eq!(RecipeType::from_u8(0x04), Some(RecipeType::Download));
    assert_eq!(RecipeType::from_u8(0x05), Some(RecipeType::Process));
    assert_eq!(RecipeType::from_u8(0x00), None);
    assert_eq!(RecipeType::from_u8(0x06), Some(RecipeType::Unpack));
    assert_eq!(RecipeType::from_u8(0xFF), None);
}

#[test]
fn recipe_type_tag_matches_encode() {
    let file = Recipe::File(RecipeFile {
        content_blob_hash: test_hash(),
        executable: false,
        resources_hash: None,
    });
    assert_eq!(file.recipe_type(), RecipeType::File);
    assert_eq!(file.encode()[4], 0x01);

    let dir = Recipe::Directory(RecipeDirectory { entries: vec![] });
    assert_eq!(dir.encode()[4], 0x02);

    let sym = Recipe::Symlink(RecipeSymlink {
        target: "x".into(),
    });
    assert_eq!(sym.encode()[4], 0x03);

    let dl = Recipe::Download(RecipeDownload {
        url: "http://x".into(),
        hash_algorithm: HashAlgorithm::Blake3,
        expected_hash: test_hash(),
    });
    assert_eq!(dl.encode()[4], 0x04);

    let proc = Recipe::Process(RecipeProcess {
        platform: "x86_64-linux".into(),
        command: "/bin/true".into(),
        args: vec![],
        env: vec![],
        dependencies: vec![],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0x00,
        runtime_deps: None,
        runtime: None,
    });
    assert_eq!(proc.encode()[4], 0x05);
}

// ===========================================================================
// Unpack recipe backward compatibility
// ===========================================================================

#[test]
fn unpack_without_archive_recipe_hash_decodes() {
    // Build an Unpack recipe without tail fields, encode it,
    // then decode it. The fields should be None/None.
    let recipe = Recipe::Unpack(RecipeUnpack {
        archive_hash: test_hash(),
        format: ArchiveFormat::TarGz,
        archive_recipe_hash: None,
        strip_components: None,
    });
    let bytes = recipe.encode();
    let decoded = Recipe::decode(&bytes).unwrap();
    match decoded {
        Recipe::Unpack(u) => {
            assert_eq!(u.archive_hash, test_hash());
            assert_eq!(u.format, ArchiveFormat::TarGz);
            assert_eq!(u.archive_recipe_hash, None);
            assert_eq!(u.strip_components, None);
        }
        _ => panic!("expected Unpack recipe"),
    }
}

#[test]
fn unpack_with_archive_recipe_hash_roundtrips() {
    let recipe = Recipe::Unpack(RecipeUnpack {
        archive_hash: test_hash(),
        format: ArchiveFormat::TarXz,
        archive_recipe_hash: Some(test_hash_b()),
        strip_components: None,
    });
    let bytes = recipe.encode();
    let decoded = Recipe::decode(&bytes).unwrap();
    match decoded {
        Recipe::Unpack(u) => {
            assert_eq!(u.archive_hash, test_hash());
            assert_eq!(u.format, ArchiveFormat::TarXz);
            assert_eq!(u.archive_recipe_hash, Some(test_hash_b()));
            assert_eq!(u.strip_components, None);
        }
        _ => panic!("expected Unpack recipe"),
    }
}

#[test]
fn unpack_with_strip_components_roundtrips() {
    let recipe = Recipe::Unpack(RecipeUnpack {
        archive_hash: test_hash(),
        format: ArchiveFormat::TarGz,
        archive_recipe_hash: None,
        strip_components: Some(1),
    });
    let bytes = recipe.encode();
    let decoded = Recipe::decode(&bytes).unwrap();
    match decoded {
        Recipe::Unpack(u) => {
            assert_eq!(u.archive_hash, test_hash());
            assert_eq!(u.format, ArchiveFormat::TarGz);
            assert_eq!(u.archive_recipe_hash, None);
            assert_eq!(u.strip_components, Some(1));
        }
        _ => panic!("expected Unpack recipe"),
    }
}

#[test]
fn roundtrip_unpack_zip() {
    let recipe = Recipe::Unpack(RecipeUnpack {
        archive_hash: test_hash(),
        format: ArchiveFormat::Zip,
        archive_recipe_hash: None,
        strip_components: None,
    });
    let bytes = recipe.encode();
    assert_eq!(bytes[4], 0x06); // Unpack type tag
    let decoded = Recipe::decode(&bytes).unwrap();
    assert_eq!(recipe, decoded);
}

// ===========================================================================
// Process runtime metadata
// ===========================================================================

fn process_with_runtime(runtime: Option<RuntimeMeta>) -> Recipe {
    Recipe::Process(RecipeProcess {
        platform: "x86_64-linux".into(),
        command: "/bin/true".into(),
        args: vec![],
        env: vec![],
        dependencies: vec![],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0x00,
        runtime_deps: Some(vec!["glib".into(), "xkeyboard-config".into()]),
        runtime,
    })
}

#[test]
fn process_runtime_absent_matches_legacy_bytes() {
    // A recipe with `runtime: None` must encode byte-identically to the
    // pre-runtime tail layout (runtime_deps present, nothing after it), so
    // existing recipe hashes are preserved.
    let recipe = process_with_runtime(None);
    let bytes = recipe.encode();
    let decoded = Recipe::decode(&bytes).unwrap();
    assert_eq!(recipe, decoded);

    // Toggling runtime to an empty-but-present meta must change the bytes.
    let with_empty = process_with_runtime(Some(RuntimeMeta::default()));
    assert_ne!(with_empty.encode(), bytes);
}

#[test]
fn process_runtime_roundtrips() {
    let runtime = RuntimeMeta {
        provides: vec![
            RuntimeDirective {
                op: WrapOp::Set,
                var: "XKB_CONFIG_ROOT".into(),
                sep: None,
                sources: vec![RuntimeSource::SelfPath("share/X11/xkb".into())],
            },
            RuntimeDirective {
                op: WrapOp::Prefix,
                var: "GSETTINGS_SCHEMA_PATH".into(),
                sep: Some(":".into()),
                sources: vec![
                    RuntimeSource::SelfPath("share/glib-2.0/schemas".into()),
                    RuntimeSource::Dep(DepRef {
                        name: "glib".into(),
                        sub: "share/glib-2.0/schemas".into(),
                    }),
                ],
            },
        ],
        wrapper: vec![
            RuntimeDirective {
                op: WrapOp::InheritArgv0,
                var: String::new(),
                sep: None,
                sources: vec![],
            },
            RuntimeDirective {
                op: WrapOp::SetDefault,
                var: "MAGIC".into(),
                sep: None,
                sources: vec![RuntimeSource::FirstExisting(vec![
                    RuntimeSource::SelfPath("share/misc/magic.mgc".into()),
                    RuntimeSource::Dep(DepRef {
                        name: "file".into(),
                        sub: "share/misc/magic.mgc".into(),
                    }),
                ])],
            },
        ],
    };
    let recipe = process_with_runtime(Some(runtime));
    let bytes = recipe.encode();
    let decoded = Recipe::decode(&bytes).unwrap();
    assert_eq!(recipe, decoded);
}

#[test]
fn process_runtime_without_runtime_deps_roundtrips() {
    // runtime present, runtime_deps absent: the encoder must still emit the
    // runtime_deps presence byte (0x00) so the decoder can reach `runtime`.
    let recipe = Recipe::Process(RecipeProcess {
        platform: "x86_64-linux".into(),
        command: "/bin/true".into(),
        args: vec![],
        env: vec![],
        dependencies: vec![],
        workdir_hash: None,
        output_scaffold_hash: None,
        unsafe_flags: 0x00,
        runtime_deps: None,
        runtime: Some(RuntimeMeta {
            provides: vec![],
            wrapper: vec![RuntimeDirective {
                op: WrapOp::Unset,
                var: "LD_LIBRARY_PATH".into(),
                sep: None,
                sources: vec![],
            }],
        }),
    });
    let bytes = recipe.encode();
    let decoded = Recipe::decode(&bytes).unwrap();
    assert_eq!(recipe, decoded);
}

#[test]
fn process_runtime_rejects_duplicate_singleton() {
    let recipe = process_with_runtime(Some(RuntimeMeta {
        provides: vec![
            RuntimeDirective {
                op: WrapOp::Set,
                var: "FOO".into(),
                sep: None,
                sources: vec![RuntimeSource::Literal("a".into())],
            },
            RuntimeDirective {
                op: WrapOp::Set,
                var: "FOO".into(),
                sep: None,
                sources: vec![RuntimeSource::Literal("b".into())],
            },
        ],
        wrapper: vec![],
    }));
    let bytes = recipe.encode();
    assert!(Recipe::decode(&bytes).is_err());
}

#[test]
fn process_runtime_rejects_prefix_without_sep() {
    let recipe = process_with_runtime(Some(RuntimeMeta {
        provides: vec![RuntimeDirective {
            op: WrapOp::Prefix,
            var: "PATH".into(),
            sep: None,
            sources: vec![RuntimeSource::SelfPath("bin".into())],
        }],
        wrapper: vec![],
    }));
    let bytes = recipe.encode();
    assert!(Recipe::decode(&bytes).is_err());
}

#[test]
fn process_runtime_rejects_argv0_with_wrong_source_count() {
    let recipe = process_with_runtime(Some(RuntimeMeta {
        provides: vec![],
        wrapper: vec![RuntimeDirective {
            op: WrapOp::Argv0,
            var: "x".into(),
            sep: None,
            sources: vec![],
        }],
    }));
    let bytes = recipe.encode();
    assert!(Recipe::decode(&bytes).is_err());
}
