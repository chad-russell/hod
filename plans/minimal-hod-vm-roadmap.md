# Minimal Hod VM Roadmap

**Status:** Active — top priority
**Current authority:** This document for product direction

## Goal

Bootable QEMU VM where Hod owns the application, service, and desktop layer.
Base distro provides kernel, init, networking. Everything else comes from the
Hod store.

## Current VM: Arch Seed + Direct Kernel Boot

`scripts/hod-arch-build` + `scripts/hod-arch-run`. Bare ext4, no partition
table, no bootloader. Direct kernel boot for fastest QEMU dev loop.

Architecture:

```
QEMU (-kernel / -initrd / -append)
  → Arch kernel + custom initramfs
  → Bare ext4 rootfs
    /usr/hod/store/       (Hod content-addressed store)
    /usr/hod/system/      (generation symlink farm)
    /etc/profile.d/hod.sh (PATH, MANPATH, XDG_DATA_DIRS)
  → systemd → networkd + resolved + sshd + hod-heartbeat
```

Build pipeline: `pacman --root` in rootless podman → configure rootfs →
`hod system activate` → copy closure + generation → mkinitcpio → qcow2.

Iteration: `just build-vm` (reuses rootfs, rebuilds Hod layer + disk, ~30s).

### Alternative: bootc

`scripts/hod-fedora-bootc-build` + `scripts/hod-fedora-bootc-run` still work.
Deprioritized in favor of the simpler Arch seed. May return for bare-metal
deployment.

## Phase 4: Niri Desktop — IN PROGRESS

Exit criteria:

- VM boots to a graphical Wayland session
- Hod-built terminal opens
- Basic shell: background, notifications, launcher

See `niri-desktop-roadmap.md` for milestone tracking.

**Milestone 1 done** (2026-06-03): niri session auto-launches, alacritty opens
via keybindings, CPU idle.

## Phase 5: Full Desktop Stack — FUTURE

Exit criteria:

- VM runs a complete desktop session from Hod store packages
- desktop apps launch from Hod profiles
- closure copy / image rebuild is repeatable

COSMIC is the intended full desktop target. Resumes after distro-style
packaging infrastructure lands. See `cosmic-desktop-roadmap.md`.

## Phase 6: Trust-Base Reduction — FUTURE

Exit criteria:

- base distro dependencies audited
- pieces replaced by Hod-built equivalents where practical
- long-term path toward BusyBox/LFS-like base is clear

## Non-Goals (for now)

- secure boot, disk encryption, multi-user hardening
- fully custom rootfs
- proprietary GPU drivers
