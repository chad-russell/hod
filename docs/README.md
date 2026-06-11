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
| Work on containers / podman | `podman-setup.md` |
| Work on desktop environments | `../plans/niri-desktop-roadmap.md` |
| **Work on the system architecture** | **`../plans/hod-system-architecture.md`** |
| Build a bootc-derived Hod OS image | **`../plans/hod-os-bootc.md`** |
| Work on Ghostty packaging/runtime issues | `ghostty.md` |
| Work on build env policy / metadata | `build-environment-and-metadata.md` |

## Current docs

- `agent-package-guide.md` — practical package-authoring guide and patterns.
- `bootstrap-pipeline.md` — seed → toolchain → downstream pipeline.
- `bootc-image-workflow.md` — bootc-derived Hod OS image (historical; superseded by `../plans/hod-os-bootc.md`).
- `build-environment-and-metadata.md` — build-env model and future metadata direction.
- `closure-transfer.md` — `hod closure` and `hod copy-closure` behavior.
- `debugging-builds.md` — debugging workflows.
- `ghostty.md` — Ghostty packaging/runtime notes and relocation lessons.
- `profiles.md` — TypeScript profiles and symlink-farm activation.
- `recipe-compiler-guide.md` — TypeScript SDK / recipe import workflow.
- `relocatable-binaries-guide.md` — ELF relocation, bootstrap injection, wrappers, portability.
- `podman-setup.md` — rootless podman + distrobox setup and troubleshooting.
- `system-profiles.md` — generation-numbered system profile model (`hod system ...`).

## Current status

The **ThinkPad profile** is a current portability target for user packages and
GUI applications. Ghostty 1.3.1 builds on `bees`, copies to the ThinkPad via
`copy-closure --from`, and runs from the Hod store.

COSMIC is **paused**. All 18/19 components build; resuming requires distro-style
integration (upstream install targets, portal packaging, systemd user units).
See `../plans/cosmic-desktop-roadmap.md`.

## Next fronts

1. **Hod OS bootc integration** — build OCI images from TypeScript system config, deploy via `bootc switch`. See `../plans/hod-os-bootc.md`.
2. **Hod System Architecture** — store, recipes, composefs generation (Phases 1-2 done). See `../plans/hod-system-architecture.md`.
3. **Tech debt cleanup** — strip standardization, recipe ergonomics.
4. **Bindgen infrastructure** — unblocks `xdg-desktop-portal-cosmic`.
5. **Improve multi-machine workflows** — `copy-closure --from`, binary-cache patterns.
