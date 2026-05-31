# Plans Index

This directory holds active planning notes and recently-implemented design
records. Implemented or historical plans are deleted as their content gets
absorbed into `docs/`, source comments, or current code; this index stays
small.

**Read `../docs/README.md` first** for current behavior. Use this index to
find what's currently being planned or recently shipped.

## Status guide

- **Active** — work is in flight or queued.
- **Implemented** — landed; kept here as design rationale that's not yet
  fully captured in `docs/` or code comments. Will be deleted once that
  capture is complete.

## Top priority

**`minimal-hod-vm-roadmap.md`** — Active. The current product direction:
build a bootable QEMU VM from a minimal Arch seed with direct kernel boot,
where Hod owns the content-addressed application/service/desktop layer
baked into the OS image.

The next concrete tasks under this roadmap are tracked as their own plans:

1. **`alpine-vm-validation.md`** — Implemented. Validated locally-built
   profiles against a fresh Alpine VM via the new `tests/vm/` framework.
   See `tests/vm/README.md`.
2. **`service-boundary.md`** — Implemented. **Architecture record** for
   the Arch seed + direct kernel boot approach.
3. **`hod-arch-os.md`** — Implemented. Arch seed VM with all acceptance
   criteria met.
4. **`future-tracks.md`** — Active. Backlog of well-scoped tracks
   (graphical session, recipe ergonomics cleanup, closure distribution
   UX, trust-base reduction, plus the existing bindgen plan). Promote to
   real plans when ready to start.

## Service-boundary sub-plans

`service-boundary.md` decomposes into focused sub-plans. All are now
implemented.

| # | File | Status | Notes |
|---|------|--------|-------|
| 1 | `hod-system-profile.md` | Implemented | First-class `hod system` generation/list/rollback/pin CLI surface. |
| 2 | `bootc-image-builder.md` | Implemented | Fedora bootc-derived image with baked Hod store + system profile. Boots in QEMU. |
| 3 | `hod-arch-os.md` | Implemented | Arch seed + direct kernel boot VM. Primary VM target. All acceptance criteria met. |
| 4 | `heartbeat-service-poc.md` | Implemented | Trivial Hod service running from the baked layer as a systemd unit. |
| 5 | `etc-generation.md` | Rescoped | Hod renders systemd units/drop-ins via the build script. |
| later | `cosmic-on-hod-vm.md` | Future | COSMIC desktop on the Arch VM. Out of scope for service-boundary. |

## Other active plans

| File | Status | Notes |
|------|--------|-------|
| `cosmic-desktop-roadmap.md` | Active sub-plan | Full COSMIC component build plan. Pairs with `cosmic-on-hod-vm.md` for the desktop phase of `minimal-hod-vm-roadmap.md`. |
| `bindgen-infrastructure.md` | Active | Hermetic bindgen for the sandbox. Unblocks `xdg-desktop-portal-cosmic` and other crates that run bindgen at build time. |
| `standardize-strip-in-profiles.md` | Active cleanup candidate | Small, scoped cleanup for shared-library stripping. |

## Recently implemented (kept for design rationale)

| File | Status | Notes |
|------|--------|-------|
| `hod-arch-os.md` | Implemented | Arch seed + direct kernel boot VM. Primary VM target. All acceptance criteria met. |
| `service-boundary.md` | Implemented | Architecture record for Arch seed + direct kernel boot approach. |
| `hod-system-profile.md` | Implemented | Adds `hod system` generation/list/rollback/pin primitives and `docs/system-profiles.md`. |
| `alpine-vm-validation.md` | Implemented | Validation pass + new VM test framework under `tests/vm/`. See `tests/vm/README.md`. K2 ld-linux symlink is now automated by the deploy script. |
| `real-store-in-sandbox.md` | Implemented | Sandbox layout now mirrors the host store (`/store/staging/<shard>/<hex>/`). Documents why and the invariant. |
| `transitive-runtime-closure.md` | Implemented | Sandbox bind-mounts include the transitive runtime closure of direct deps. Companion to the layout fix; together they fix the K1 cluster. |

Implemented plans are deleted once the invariants they document are fully
absorbed into `docs/` or source comments.

## Plan-file conventions

When adding or updating a plan:

- Include **Status**, **Owner**, and either **Depends on** or **Current
  authority** near the top.
- Active plans should say what done looks like (acceptance criteria).
- Implemented plans should point at the current authority (docs/source).
- Once an implemented plan's content lives in current docs/source, delete
  the plan file rather than letting it accumulate.
- New tracks that aren't yet ready for full planning go in
  `future-tracks.md` as a short writeup, not in their own file.
