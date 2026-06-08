# Hod OS: bootc Integration Plan

**Status:** Active — Phase 1 (Beta) implementation
**Supersedes:** `hod-system-architecture.md` Phase 3+ (store-native boot)
**Retained:** `hod-system-architecture.md` Phases 1-2 (store, recipes, composefs generation) remain valid infrastructure

## Motivation

Instead of building our own initramfs, bootloader integration, btrfs layout, and partition
management, we embed in the bootc ecosystem. This is the "Clojure approach": bootc/OCI is the
JVM, Hod is the language that runs on top of it.

**Concrete user story:**

1. A Bluefin user runs `sudo bootc switch ghcr.io/hod-os/hod-os:stable`
2. Their system reboots into Hod OS — same partition layout, same rollback safety net
3. All their user-space is now built by Hod from source, managed via TypeScript recipes
4. If they don't like it: `sudo bootc switch ghcr.io/ublue-os/bluefin:stable` to go back
5. `bootc upgrade` continues to work — pulling new Hod OS images from the registry

## Architecture

```
  systems/hod-desktop.ts          (TypeScript system config)
          │
          ▼
  ┌───────────────────┐
  │ hod system build   │   (existing: resolve packages, build, generate FHS tree)
  └────────┬──────────┘
           │
           ▼
  ┌───────────────────┐
  │ hod system oci     │   (NEW: package FHS tree into OCI layer)
  └────────┬──────────┘
           │
           ▼
  ┌───────────────────┐
  │ Containerfile      │   FROM <base>, COPY hod-built rootfs, configure system
  └────────┬──────────┘
           │
           ▼
  ┌───────────────────┐
  │ podman build       │   → OCI image tagged ghcr.io/hod-os/hod-os:stable
  └────────┬──────────┘
           │
           ▼
  ┌───────────────────┐
  │ podman push        │   → GHCR / registry
  └────────┬──────────┘
           │
           ▼
  bootc switch / bootc upgrade / bootc rollback
```

## Base Image Strategy

We start with a **fully-featured base** and progressively strip it down.

| Stage | Base Image | What it provides | What Hod provides |
|-------|-----------|-----------------|-------------------|
| **Alpha** | `ghcr.io/ublue-os/bluefin:stable` | Everything (GNOME, kernel, systemd, rpm packages) | A few Hod-built packages layered on top |
| **Beta** | `ghcr.io/ublue-os/base-main:latest` | Kernel, systemd, base system, bootc infrastructure | Desktop environment + apps built by Hod |
| **Gamma** | `quay.io/fedora/fedora-bootc:42` | Kernel, systemd, glibc, minimal userland | Everything else built by Hod from source |
| **Delta** | `quay.io/almalinuxorg/almalinux-bootc:10` or minimal custom | Kernel, systemd | Full userland from Hod recipes |

The Alpha stage is the quick win: prove the pipeline works, get `bootc switch` working,
then gradually move left on the table.

## What bootc gives us (for free)

- **Atomic updates**: New OCI image = new system state. No generation management needed.
- **Rollback**: `bootc rollback` reverts to previous image. Boot counting for auto-rollback.
- **A/B partitioning**: bootc manages the partition layout (DPS-compliant).
- **Kernel + initramfs**: Base image provides them. No custom initramfs needed.
- **Bootloader**: bootc manages GRUB/systemd-boot.
- **Distribution**: OCI registries (GHCR, Quay), signing (cosign), mirroring.
- **ISO generation**: `bootc-image-builder` produces installable ISOs and disk images.
- **`bootc switch`**: Seamless switching between any bootc image — Bluefin ↔ Hod OS.

## What Hod gives us (that bootc doesn't)

- **Deterministic, content-addressed builds**: Every package built from source, BLAKE3-hashed.
- **Declarative TypeScript system config**: `systems/hod-desktop.ts` defines the whole system.
- **Hermetic sandbox builds**: No host contamination.
- **Reproducibility**: Same recipe → same output hash, always.
- **Custom package versions**: Build any version of any package, not just what the distro ships.
- **Cross-distro potential**: Same recipes work whether the base is Fedora, Alma, or Arch.

## Implementation Phases

### Phase 0: Proof of concept (Alpha)

**Goal**: Build a bootc-compatible OCI image from Bluefin base + Hod packages. `bootc switch` to it.

- [ ] Create `image/` directory with Containerfile and build scripts
- [ ] Containerfile: `FROM ghcr.io/ublue-os/bluefin:stable`, layer Hod-built packages
- [ ] Build script: `hod system build systems/hod-desktop.ts` → FHS tree → COPY into image
- [ ] Validate with `bootc container lint`
- [ ] Push to GHCR, `bootc switch` on a test machine
- [ ] Verify `bootc rollback` works

**Key files:**
```
image/
  Containerfile       FROM bluefin, COPY hod-built rootfs
  build.sh            Build pipeline (hod build → podman build → push)
  justfile            Just commands for the image workflow
```

**Containerfile sketch:**
```dockerfile
ARG BASE=ghcr.io/ublue-os/bluefin:stable
FROM ${BASE}

LABEL containers.bootc=1

# Copy Hod-built packages into the image
COPY --chmod=0755 rootfs/ /

# Run any post-install configuration
RUN systemctl enable hod-heartbeat

RUN bootc container lint
```

**Build pipeline:**
```bash
#!/bin/bash
set -euo pipefail

# 1. Build all packages from TypeScript system config
hod system build systems/hod-desktop.ts

# 2. Generate FHS tree from the generation
# (reuse scripts/generate-composefs or new script that produces plain FHS)
./scripts/generate-rootfs <generation-dir> image/rootfs

# 3. Build OCI image
podman build -t ghcr.io/hod-os/hod-os:latest image/

# 4. Push (or test locally)
podman push ghcr.io/hod-os/hod-os:latest
```

### Phase 1: Minimal viable system (Beta) — IN PROGRESS

**Goal**: Use `base-main` instead of Bluefin. Hod provides the desktop.

- [x] Switch base to `ghcr.io/ublue-os/base-main:latest`
- [x] Add Hod-built niri, alacritty, fuzzel, pipewire to the image
- [x] Generate /etc from system config (passwd, hostname, systemd units)
- [x] Add session configuration (niri config, autologin)
- [x] Create `scripts/hod-ublue-build` build pipeline
- [x] Create `scripts/hod-ublue-run` boot/test script
- [x] Add Justfile targets (`ublue-build`, `ublue-test`, etc.)
- [ ] Test: boot into Hod OS with niri desktop
- [ ] Fix: resolve runtime issues (libs, DRM, audio)

**Implementation files:**
- `scripts/hod-ublue-build` — full build pipeline (pull base → build profile → stage closure → rewrite symlinks → generate Containerfile → podman build)
- `scripts/hod-ublue-run` — generate bootable disk (bootc install to-filesystem → systemd-boot → QEMU)
- `Justfile` — `ublue-build`, `ublue-run`, `ublue-test`, etc.

### Phase 2: Self-built userland (Gamma)

**Goal**: Use Fedora bootc base. Hod builds everything above glibc/kernel.

- [ ] Switch base to `quay.io/fedora/fedora-bootc:42`
- [ ] Build and install the full Hod desktop from source
- [ ] Include all runtime dependencies in the image
- [ ] Handle font/icon/theme packages
- [ ] Generate systemd services for Hod-managed daemons
- [ ] ISO generation with `bootc-image-builder`

### Phase 3: Maximum Hod (Delta)

**Goal**: Minimal base, maximum Hod control.

- [ ] Use Alma bootc or custom minimal base
- [ ] Bootstrap glibc and core toolchain from Hod recipes (long-term)
- [ ] Replace distro packages one by one
- [ ] Composefs inside the OCI image for FHS presentation

### Phase 4: Developer experience

**Goal**: Make the loop tight for developers building on Hod OS.

- [ ] `hod system oci` — build system config → OCI image in one command
- [ ] `hod system push` — push to registry
- [ ] `hod system iso` — generate installable ISO
- [ ] CI integration: GitHub Actions workflow for automated image builds
- [ ] Cosign signing pipeline
- [ ] `hod system diff` — show what changed between two system generations/images

## Relationship to existing work

| Existing component | Role in bootc world |
|---|---|
| `src/store.rs` | Build-time artifact. Store lives on the build machine, not in the image. |
| `recipes/**/*.ts` | Unchanged. These define what gets built. |
| `src/build.rs`, sandbox | Unchanged. Builds packages deterministically. |
| `src/system.rs` evaluate_system | Unchanged. Parses system.ts config. |
| `src/system.rs` generate_etc | Used during image build to populate /etc. |
| `scripts/generate-composefs` | Optional. Can produce FHS tree for the OCI layer. |
| `src/system.rs` generate_composefs | Called during image build. |
| `src/profile.rs` | Still valid for user profiles on developer machines. |
| `src/closure.rs` | Used to resolve full closures for image assembly. |
| `hod copy-closure` | Less relevant; OCI push replaces it for deployment. |
| `hod system activate` | Replaced by `bootc switch`. Generation dir still used for intermediate builds. |

## Key decisions

1. **OCI image as the deployment unit, not store-native delivery.** `podman push` + `bootc upgrade` replaces `hod copy-closure` + btrfs send/receive.
2. **The Hod store is a build-time concept.** It lives on the build machine. The OCI image contains the assembled FHS rootfs, not the store structure.
3. **composefs is optional, not required.** The OCI image can contain a plain FHS tree. composefs adds content-addressing inside the image but isn't necessary for bootc to work.
4. **System generations map to OCI image tags.** Generation N = `ghcr.io/hod-os/hod-os:gen-N` (or `:latest`, `:stable`).
5. **`bootc switch` is the activation mechanism.** No need for our own `hod system activate` on the target machine.
6. **The TypeScript system config is the source of truth.** `systems/hod-desktop.ts` defines the system; `hod system build` + `podman build` realize it.

## Open questions

1. **How to handle Hod store path references in the image?** Binaries have RPATH pointing to store staging dirs. Need to either: (a) patch RPATH to FHS paths (already done in generate-composefs), or (b) include the store structure in the image.
2. **How to handle kernel modules?** Base image provides them. Hod-built kernel modules would need to match the base kernel exactly.
3. **How to handle firmware?** Base image provides it. Long-term: build linux-firmware from source?
4. **What about `/var` and `/etc` persistence?** bootc handles this: `/etc` and `/var` are machine state that persists across upgrades. Generated /etc goes into the image; runtime changes persist.
5. **Multi-arch?** bootc supports x86_64 and aarch64. Our recipes would need to build for both.
6. **CI/CD for image builds?** GitHub Actions with podman build + push, similar to Bluefin's pipeline.
