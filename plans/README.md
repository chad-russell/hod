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
| `end-user-runtime.md` | Superseded | Early runtime/profile design; current implementation uses TS profiles, `src/run.rs`, and `src/profile.rs`. |
| `geany-wrapper-handoff.md` | Historical / resolved | Records the Geany portability investigation and fix path. |
| `go-language-support.md` | Implemented | Go helper/toolchain work now exists in `recipes/helpers/go.ts` and `recipes/native/go/`. |
| `gtk-gui-roadmap.md` | Active | Desktop/runtime work remains a strong next frontier, but parts of the roadmap are already complete. |
| `merge-rpath-bootstrap-segment.md` | Implemented | Current authority is `src/packed.rs` and `docs/relocatable-binaries-guide.md`. |
| `profiles.md` | Implemented | Current behavior is documented in `docs/profiles.md`. |
| `rebuild-after-shellbuild-redesign.md` | Historical | Investigation log for the shellBuild env redesign and rebuild/GC validation. |
| `standardize-strip-in-profiles.md` | Active cleanup candidate | Small cleanup with clear scope. |
| `transfer-to-laptop.md` | Historical / completed | Pre-`hod copy-closure` transfer notes; superseded by current closure tooling. |

## Best places to go next

After the Geany + closure-transfer milestone, the best follow-on work is likely:

1. **Desktop runtime generalization**
   - make the Geany success boring and repeatable for more GUI apps
   - improve generic wrapper/runtime metadata behavior
2. **Closure distribution UX**
   - implement or revisit `copy-closure --from`
   - move toward cache-like multi-machine workflows
3. **Bootstrap minimization**
   - reduce the irreducible seed and keep tightening the trust story
4. **Low-risk cleanup**
   - finish strip/profile cleanup work from `standardize-strip-in-profiles.md`

## Plan-file best practice

When updating or adding a plan:

- include **Status**, **Date**, and **Current authority** near the top
- say whether the doc is active, implemented, superseded, or historical
- link to the current implementation/docs
- avoid mixing current behavior and speculation without labeling them
