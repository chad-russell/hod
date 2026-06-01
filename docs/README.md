# Docs Index

This directory is the **current documentation authority** for Hod.

> There is no top-level `PRD.md` in this checkout. If code or notes still mention a PRD, prefer the docs here plus the current Rust/TypeScript source.

## Read by task

| Task | Start here |
|------|------------|
| Understand the project quickly | `../README.md`, `../AGENTS.md`, this file |
| Author or update recipes | `agent-package-guide.md`, `recipe-compiler-guide.md` |
| Understand bootstrap/self-hosting | `bootstrap-pipeline.md` |
| Debug a build | `debugging-builds.md` |
| Understand runtime relocation / portability | `relocatable-binaries-guide.md`, `closure-transfer.md` |
| Work on profiles / end-user activation | `profiles.md`, `system-profiles.md` |
| Work on the minimal Hod VM | `minimal-vm-workflow.md`, `../plans/minimal-hod-vm-roadmap.md` |
| Work on desktop environments | `../plans/niri-desktop-roadmap.md`, `../plans/cosmic-desktop-roadmap.md` |
| Build a bootc-derived Hod OS image | `bootc-image-workflow.md` |
| Add or run automated VM tests | `../tests/vm/README.md` |
| Work on build env policy / metadata | `build-environment-and-metadata.md` |

## Current docs

- `agent-package-guide.md` — practical package-authoring guide and patterns.
- `bootstrap-pipeline.md` — seed → toolchain → downstream pipeline and current bootstrap status.
- `bootc-image-workflow.md` — bootc-derived Hod OS image: build, disk generation, QEMU boot.
- `build-environment-and-metadata.md` — current build-env model and future metadata direction.
- `closure-transfer.md` — `hod closure` and `hod copy-closure` behavior.
- `debugging-builds.md` — current debugging workflows.
- `minimal-vm-workflow.md` — remote-friendly QEMU workflow for the first Hod OS VM.
- `profiles.md` — TypeScript profiles and symlink-farm activation.
- `recipe-compiler-guide.md` — TypeScript SDK / recipe import workflow.
- `relocatable-binaries-guide.md` — ELF relocation, bootstrap injection, wrappers, portability.
- `system-profiles.md` — generation-numbered system profile model (`hod system ...`).

## Historical plans

Historical or in-progress design notes live in `../plans/`.

Read `../plans/README.md` before trusting any individual plan file.

## Recent milestone

The Fedora bootc-derived Hod OS VM boots end-to-end:

- derived from `quay.io/fedora/fedora-bootc:41` with a baked Hod layer under `/usr/hod/...`
- **10 Hod packages** functional (bat, curl, eza, fd, file, fzf, git, htop, jq, less)
- SSH with ed25519 key authentication works
- systemd-boot + ostree deployment; `bootc status` reports the image
- boot in ~5 seconds with KVM
- scripts: `scripts/hod-fedora-bootc-build` + `scripts/hod-fedora-bootc-run`

Prior milestone (still valid):

- build **Nautilus 48.7** from source (full GTK4/libadwaita GUI stack)
- copy its closure to another machine and run it there — closure transfer + relocation + wrapper/runtime setup work for complex GUI apps

## Desktop status

COSMIC is currently **paused** as the main desktop target. Hod can build the
COSMIC component binaries, but a usable COSMIC desktop requires distro-level
integration beyond source builds: upstream install data, `/share/cosmic`,
wallpapers, portals, systemd user units, D-Bus activation, dconf/polkit/upower,
and package-specific feature choices. Recent VM debugging confirmed that normal
Wayland client windows render under `cosmic-comp`, but the shell remains
incomplete due to layer-shell/default-data/session integration gaps. See
`../plans/cosmic-desktop-roadmap.md` for the paused state.

The active desktop direction is now a smaller Niri environment. Niri is a
compositor/window manager rather than a full desktop environment, so Hod can
provide a minimal usable session with `niri`, `alacritty`, `mako`, and a small
Hod-authored config before packaging a full portal/bar/launcher ecosystem. See
`../plans/niri-desktop-roadmap.md`.

## Suggested next fronts

1. **Niri desktop on Arch VM** — smaller compositor-first desktop target. See `../plans/niri-desktop-roadmap.md`.
2. Improve closure pull/cache workflows (`copy-closure --from`).
3. Keep shrinking the bootstrap trust base.
