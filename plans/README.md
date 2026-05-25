# Plans Index

`plans/` contains planning notes, design history, investigations, and handoff docs.

**Do not treat this directory as the default source of truth.** Read `../docs/README.md` first, then use this file to decide whether a plan is still active.

## Status guide

- **Active** — still a good place to continue work.
- **Implemented** — useful historical design context; current authority is elsewhere.
- **Superseded** — replaced by a newer design or implementation.
- **Historical** — investigation log or handoff note; useful for archaeology only.

## Plan status

| File | Status | Notes |
|------|--------|-------|
| `copy-closure-design.md` | Implemented | Current behavior is in `docs/closure-transfer.md` and `src/closure.rs`. |
| `bindgen-infrastructure.md` | Active | General, hermetic bindgen support for sandboxed Rust builds. Needed to unblock upstream `bindgen` users like `xdg-desktop-portal-cosmic`. |
| `end-user-runtime.md` | Superseded | Early runtime/profile design; current implementation uses TS profiles, `src/run.rs`, and `src/profile.rs`. |
| `geany-wrapper-handoff.md` | Historical / resolved | Records the Geany portability investigation and fix path. |
| `go-language-support.md` | Implemented | Go helper/toolchain work now exists in `recipes/helpers/go.ts` and `recipes/native/go/`. |
| `thinkpad-hod-migration.md` | Active | Plan to migrate ThinkPad user packages from Nix/Home Manager to Hod profiles with remote build/deploy workflows. |
| `cosmic-desktop-roadmap.md` | **Active — top priority** | Build COSMIC DE from source (Mesa → C deps → Rust apps → bootable VM). See below. |
| `gtk-gui-roadmap.md` | Superseded by `cosmic-desktop-roadmap.md` | The GTK3/GTK4 GUI stack is complete and working. COSMIC is the new desktop frontier. |
| `merge-rpath-bootstrap-segment.md` | Implemented | Current authority is `src/packed.rs` and `docs/relocatable-binaries-guide.md`. |
| `profiles.md` | Implemented | Current behavior is documented in `docs/profiles.md`. |
| `rebuild-after-shellbuild-redesign.md` | Historical | Investigation log for the shellBuild env redesign and rebuild/GC validation. |
| `standardize-strip-in-profiles.md` | Active cleanup candidate | Small cleanup with clear scope. |
| `transfer-to-laptop.md` | Historical / completed | Pre-`hod copy-closure` transfer notes; superseded by current closure tooling. |

## Best places to go next

The **top priority** is the COSMIC desktop environment roadmap (`cosmic-desktop-roadmap.md`).
This plan has five phases:

1. **Mesa / GPU graphics stack** — LLVM → Mesa (EGL/GLES), enabling GPU rendering
2. **COSMIC C library dependencies** — systemd-libs, libinput, libseat, pipewire, etc.
3. **Cargo vendoring & Rust toolkit** — reproducible offline builds of COSMIC Rust crates
4. **COSMIC desktop components** — compositor, panel, session, settings, files, edit, term, launcher
5. **Bootable VM** — Arch-based QEMU image running COSMIC from the hod store

See `cosmic-desktop-roadmap.md` for the full plan with per-phase tasks and exit criteria.

Secondary priorities:

- **Closure distribution UX** — `copy-closure --from`, cache workflows
- **Bootstrap minimization** — reduce the irreducible seed
- **Low-risk cleanup** — finish strip/profile cleanup (`standardize-strip-in-profiles.md`)

## Plan-file best practice

When updating or adding a plan:

- include **Status**, **Date**, and **Current authority** near the top
- say whether the doc is active, implemented, superseded, or historical
- link to the current implementation/docs
- avoid mixing current behavior and speculation without labeling them
