# Docs Index

This directory is the **current documentation authority** for Hod.

## Read by task

| Task | Start here |
|------|------------|
| Understand the project quickly | `../README.md`, `../AGENTS.md`, this file |
| Author or update recipes | `agent-package-guide.md`, `recipe-compiler-guide.md` |
| Understand bootstrap/self-hosting | `bootstrap-pipeline.md` |
| Debug a build | `debugging-builds.md` |
| Understand runtime relocation / portability | `relocatable-binaries-guide.md`, `closure-transfer.md` |
| Work on profiles / end-user activation | `profiles.md`, `system-profiles.md` |
| Work on the Hod OS VM | `../plans/minimal-hod-vm-roadmap.md` |
| Work on desktop environments | `../plans/niri-desktop-roadmap.md` |
| Build a bootc-derived Hod OS image | `bootc-image-workflow.md` |
| Work on build env policy / metadata | `build-environment-and-metadata.md` |

## Current docs

- `agent-package-guide.md` — practical package-authoring guide and patterns.
- `bootstrap-pipeline.md` — seed → toolchain → downstream pipeline.
- `bootc-image-workflow.md` — bootc-derived Hod OS image (deprioritized; Arch VM is primary).
- `build-environment-and-metadata.md` — build-env model and future metadata direction.
- `closure-transfer.md` — `hod closure` and `hod copy-closure` behavior.
- `debugging-builds.md` — debugging workflows.
- `profiles.md` — TypeScript profiles and symlink-farm activation.
- `recipe-compiler-guide.md` — TypeScript SDK / recipe import workflow.
- `relocatable-binaries-guide.md` — ELF relocation, bootstrap injection, wrappers, portability.
- `system-profiles.md` — generation-numbered system profile model (`hod system ...`).

## Current status

The **Niri desktop** on the Arch VM is the active work surface:

- `profiles/niri-desktop.ts` builds and activates
- VM boots via `just run-local-gl`, niri session auto-launches on tty1
- `Mod+Return` opens alacritty (Milestone 1 done)
- Next: background, notifications, launcher (Milestone 2)

See `../plans/niri-desktop-roadmap.md` for milestones.

The **Arch seed VM** (`scripts/hod-arch-build` + `scripts/hod-arch-run`) is the
primary VM target. It uses direct kernel boot, bare ext4, no partition table,
no bootloader. Hod owns the application/service/desktop layer baked into
`/usr/hod/...`.

COSMIC is **paused**. All 18/19 components build; resuming requires distro-style
integration (upstream install targets, portal packaging, systemd user units).
See `../plans/cosmic-desktop-roadmap.md`.

## Next fronts

1. **Niri desktop Milestone 2** — background, notifications, launcher.
2. **Tech debt cleanup** — strip standardization, recipe ergonomics.
3. **Bindgen infrastructure** — unblocks `xdg-desktop-portal-cosmic`.
4. **Closure distribution UX** — `copy-closure --from`, binary-cache patterns.
