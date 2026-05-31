//! Hod — a deterministic, content-addressed build system.
//!
//! For project-level context, prefer `README.md`, `AGENTS.md`, and `docs/README.md`.
//!
//! The crate is organized into modules for each concern:
//!
//! - `encoding` — deterministic binary serialization (`Encoder` / `Decoder`)
//! - `hash` — BLAKE3 hashing utilities and hex helpers
//!
//! - `recipe` — recipe data types, binary encoding/decoding, hashing
//! - `store` — SQLite + filesystem content-addressed storage
//! - `build` — build orchestrator (DAG resolution, caching, dispatch)
//! - `download` — URL fetching with hash verification (stub)
//!
//! - `packed` — packed executables (ELF RPATH patching for relocatable outputs)

pub mod build;
pub mod closure;
pub mod download;
pub mod encoding;
pub mod git_fetch;
pub mod hash;
pub mod packed;
pub mod profile;
pub mod recipe;
pub mod relocate;
pub mod run;
pub mod sandbox;
pub mod store;
pub mod system;
pub mod wrap;
