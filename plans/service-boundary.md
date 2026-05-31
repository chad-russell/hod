# Service Boundary

**Status:** Implemented — Arch seed + direct kernel boot
**Owner:** core
**Sub-plan of:** `minimal-hod-vm-roadmap.md` Phase 3

## Purpose

This file records the OS boundary decision. The initial bootc architecture
has been superseded by the simpler Arch seed + direct kernel boot approach.
Both approaches share the same Hod layer design; they differ only in how
the base OS substrate is assembled.

## Architecture

The bootable Hod VM is built from a minimal Arch rootfs.

- The Arch seed provides: kernel, initramfs (mkinitcpio), systemd as PID 1,
  glibc/base userland, networking (systemd-networkd), SSH (openssh).
- Hod provides: a content-addressed store snapshot, a Hod system profile
  generation, Hod-built tools, services, desktop components, and
  eventually the COSMIC session.
- The Hod layer is **baked into the disk image** under `/usr/hod/...`.
- Image rebuild is the update mechanism (no atomic rollback in v1).
- Direct QEMU kernel boot (`-kernel`/`-initrd`/`-append`) for fastest dev loop.

## Decisions made

| ID | Decision | Choice | Rationale |
|----|----------|--------|-----------|
| D1 | OS substrate | Arch seed + direct kernel boot | Simplest approach: `pacman --root` in rootless podman, bare ext4, no partition table. Fastest QEMU dev loop. |
| D2 | Bootc status | Working but deprioritized | Bootc still works (`scripts/hod-fedora-bootc-build`); may return for bare-metal deployment. |
| D3 | systemd ownership | base image owns systemd | Hod embraces systemd but does not build it as PID 1. Hod writes units/drop-ins for Hod-owned services. |
| D4 | Hod store placement | baked into image under `/usr/hod/store` | Image rebuild is the update mechanism. |
| D5 | System profile placement | baked into image under `/usr/hod/system` | `hod system` generation model remains the right primitive. |
| D6 | `/etc` lifecycle | managed by build script | Build script configures `/etc` during rootfs creation. No runtime `/etc` mutation by Hod. |
| D7 | First concrete deliverable | Arch seed VM with Hod packages | Done. All acceptance criteria met. |
| D8 | Alpine VM | sunset after Arch VM is stable | Alpine validated closure transfer; Arch is now the canonical VM target. |

## What Hod owns now

Hod is the content-addressed application, service, and desktop layer
baked into an Arch-based OS image.

- Hod-built packages are content-addressed and relocated in the Hod store.
- Hod system profiles define which packages/services compose the Hod layer.
- The final disk image is the deployable system artifact.
- Rebuild the image to update (no atomic rollback in v1).

What Hod deliberately does **not** own in v1:

- PID 1 implementation.
- Kernel and modules.
- Initramfs generation (mkinitcpio from Arch).
- Base OS package updates (pacman hidden from PATH).
- Full `/etc` generation.

## Sub-plan decomposition

| # | Plan | Status | Exit criterion |
|---|------|--------|----------------|
| 1 | `hod-system-profile.md` | Implemented | `hod system` generation/list/rollback/pin works and is documented. |
| 2 | `bootc-image-builder.md` | Implemented | A derived Fedora bootc image contains a baked Hod store + system generation and boots in QEMU. |
| 3 | `hod-arch-os.md` | Implemented | Arch seed + direct kernel boot VM. All acceptance criteria met. Primary VM target. |
| 4 | `heartbeat-service-poc.md` | Implemented | A trivial Hod-built service runs from the baked Hod layer as a systemd unit. |
| 5 | `etc-generation.md` | Rescoped | Hod renders systemd units/drop-ins for its own services via the build script. |
| later | `cosmic-on-hod-vm.md` | Future | COSMIC runs from the Hod layer on the Arch VM. |

## First milestone — DONE

Build and boot an Arch seed VM with Hod packages:

1. Create minimal Arch rootfs with `pacman --root` in rootless podman.
2. Build Hod system profile with 21 packages including heartbeat.
3. Copy Hod store closure and system generation into rootfs under `/usr/hod/...`.
4. Install systemd units in `/usr/lib/systemd/system/`.
5. Create disk image (bare ext4, no partition table).
6. Boot with QEMU direct kernel boot.
7. Validate SSH, Hod packages, heartbeat service, networking, DNS.

All criteria met 2026-05-29. See `hod-arch-os.md`.

## When this plan is done

This plan is done. All sub-plans are implemented:

- Arch seed VM boots and passes all acceptance criteria.
- Heartbeat service runs from the baked Hod layer.
- Alpine is no longer the canonical OS target.
- `cosmic-on-hod-vm.md` is ready to start.
