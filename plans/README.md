# Plans Index

Active planning notes. Implemented plans are deleted once absorbed into
`docs/` or source. Read `../docs/README.md` for current behavior.

## Active plans

| File | What | Status |
|------|------|--------|
| `desktop-next.md` | Audio, networking, portals, shell tools (daily-driver gaps) | Active |
| `hod-os-bootc.md` | **Hod OS bootc integration:** OCI image build from TypeScript system config, `bootc switch` deployment | Active — Phase 0 next |
| `hod-system-architecture.md` | **Store + build infrastructure:** recipes, composefs generation, system config (Phases 1-2 done; Phase 3+ superseded by bootc) | Active |
| `fhs-via-store.md` | Replace Arch rootfs with Hod store symlinks (superseded by hod-system-architecture.md) | Superseded |
| `minimal-hod-vm-roadmap.md` | Top-level product roadmap: bootable QEMU VM with Hod-owned desktop | Active |
| `niri-desktop-roadmap.md` | Niri compositor + minimal desktop on the Arch VM | Active — Milestone 1 done |
| `bindgen-infrastructure.md` | Hermetic bindgen for the sandbox | Active |
| `declarative-runtime-wrappers.md` | **Replace `src/wrap.rs` special-casing:** provider-declared hashed runtime metadata + generic static launcher | Active — Steps 1–3 done; Step 4 slice (`file`) verified on full bootstrap; launcher = build-system infra (Model B) |
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
