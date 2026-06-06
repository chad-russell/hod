# Plans Index

Active planning notes. Implemented plans are deleted once absorbed into
`docs/` or source. Read `../docs/README.md` for current behavior.

## Active plans

| File | What | Status |
|------|------|--------|
| `desktop-next.md` | Audio, networking, portals, shell tools (daily-driver gaps) | Active |
| `hod-system-architecture.md` | **Top-level system architecture:** composefs + btrfs + declarative TypeScript config, atomic generational updates, FHS-compliant | Active — Phase 1 next |
| `fhs-via-store.md` | Replace Arch rootfs with Hod store symlinks (superseded by hod-system-architecture.md) | Superseded |
| `minimal-hod-vm-roadmap.md` | Top-level product roadmap: bootable QEMU VM with Hod-owned desktop | Active |
| `niri-desktop-roadmap.md` | Niri compositor + minimal desktop on the Arch VM | Active — Milestone 1 done |
| `bindgen-infrastructure.md` | Hermetic bindgen for the sandbox | Active |
| `flatpak-build-plan.md` | Flatpak + deps from source (8 new recipes) | Done — flatpak 1.16.6 builds and runs |
| `future-tracks.md` | Backlog of well-scoped tracks | Active backlog |

## Done

| File | What | Status |
|------|------|--------|
| `standardize-strip-in-profiles.md` | Shared-library stripping cleanup | Done — helpers cover bin/sbin/libexec/lib |

## Paused

| File | What | Status |
|------|------|--------|
| `cosmic-desktop-roadmap.md` | COSMIC desktop build plan | Paused — all 18/19 components build, distro integration gaps |
| `cosmic-on-hod-vm.md` | COSMIC on Arch VM | Future — depends on COSMIC resume |

## Conventions

- Include **Status** near the top.
- Active plans say what done looks like (acceptance criteria).
- Implemented plans are deleted, not kept.
- New tracks go in `future-tracks.md` until ready for a full plan.
