# Hod System: Atomic, FHS-Compliant, Declarative OS

**Status:** Active planning

## Vision

A NixOS-like system, rethought for 2026: build entire systems top-to-bottom from
TypeScript recipes, deliver atomically via content-addressed store + composefs,
and present a standard FHS filesystem that works with any Linux binary without
patching, wrapping, or special PATH tricks.

**From the outside, it looks like Fedora. From the inside, it's NixOS.**

## Key architectural decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Filesystem | btrfs required | Snapshots, send/receive, compression, COW dedup |
| Bootloader | systemd-boot + UKI | Simple, native boot counting for auto-rollback |
| /etc management | Generated base + overlayfs | Reproducible base, runtime persistence for NM/SSH etc. |
| FHS presentation | composefs (EROFS + overlayfs) | Zero-symlink FHS from content-addressed store |
| Delivery | Store-native (no OCI) | btrfs send/receive + copy-closure |
| Kernel | Arch kernel for now, Hod-built later | Pragmatic |
| Config language | TypeScript | Consistent with Hod recipes |
| Generations | Keep all until GC | Like NixOS, maximum rollback depth |
| Activation | Both live switch and reboot-required | Like NixOS (`hod system switch` / `hod system boot`) |

## Architecture Overview

```
                    system.ts
                       │
                       ▼
              ┌─────────────────┐
              │  hod system build│
              │  (TypeScript SDK) │
              └────────┬────────┘
                       │
          ┌────────────┼─────────────┐
          ▼            ▼             ▼
    ┌──────────┐ ┌──────────┐ ┌──────────────┐
    │ Packages │ │ /etc gen │ │ composefs    │
    │ (store)  │ │ (from    │ │ image gen    │
    │          │ │  config) │ │ (FHS tree)   │
    └──────────┘ └──────────┘ └──────────────┘
          │            │             │
          └────────────┼─────────────┘
                       ▼
              ┌─────────────────┐
              │ System          │
              │ Generation N    │
              └─────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ systemd-boot    │
              │ entry (UKI)     │
              └─────────────────┘
```

## Disk Layout

### btrfs subvolumes

```
btrfs partition (label: hod_root, subvolid=5)
├── @store/                    → /usr/hod/store (shared, content-addressed)
├── @var/                      → /var (shared, mutable, persists across generations)
├── @home/                     → /home (shared, mutable)
├── @generations/              → /usr/hod/system/generations
│   ├── <hash1>/
│   │   ├── composefs.img      (FHS metadata, ~1-5MB)
│   │   ├── kernel             (vmlinuz)
│   │   ├── initramfs          (with composefs + btrfs support)
│   │   ├── etc/               (generated /etc base)
│   │   ├── config.json        (serialized system config)
│   │   ├── activate           (activation script for live switch)
│   │   └── boot.conf          (systemd-boot entry template)
│   └── <hash2>/
├── @etc-overlay/              → overlayfs upper dirs for /etc
│   ├── <hash1>/upper/
│   ├── <hash1>/work/
│   └── <hash2>/upper/
└── @snapshots/                → btrfs read-only snapshots for send/receive
    ├── @store-2026-06-05/
    └── @store-2026-06-06/

ESP (EFI System Partition):
├── EFI/systemd/
│   └── systemd-bootx64.efi
├── hod/
│   ├── <hash1>/
│   │   ├── kernel
│   │   └── initramfs
│   └── <hash2>/
│       ├── kernel
│       └── initramfs
└── loader/
    ├── entries/
    │   ├── hod-<hash1>.conf   (current)
    │   └── hod-<hash2>.conf   (previous)
    ├── loader.conf
    └── entries.sod/           (boot counting state)
```

### Mounted filesystem at runtime

```
/                              composefs (read-only, backed by @store)
├── bin → usr/bin              (in composefs)
├── sbin → usr/bin             (in composefs)
├── lib → usr/lib              (in composefs)
├── lib64 → usr/lib64          (in composefs)
├── usr/
│   ├── bin/                   binaries from all packages (composefs redirects to @store)
│   ├── lib/                   shared libraries (composefs redirects to @store)
│   ├── libexec/
│   ├── share/                 data files (composefs)
│   ├── include/               headers (composefs)
│   ├── lib/systemd/           systemd units (composefs)
│   └── hod/
│       ├── store/             bind-mount from @store
│       └── system/
│           └── generations/   bind-mount from @generations
├── etc/                       overlayfs
│                               lower: generation's generated /etc
│                               upper: @etc-overlay/<hash>/upper/
│                               work: @etc-overlay/<hash>/work/
├── var/                       bind-mount from @var (writable)
├── home/                      bind-mount from @home (writable)
├── root/                      bind-mount from @var/root (writable)
├── tmp/                       tmpfs
├── run/                       tmpfs
│   ├── current-system → /usr/hod/system/generations/<hash>
│   └── booted-system → /usr/hod/system/generations/<hash>
├── boot/                      ESP mount
├── dev/                       devtmpfs
├── proc/                      procfs
└── sys/                       sysfs
```

## composefs: The Key Technology

### What it does

Composefs presents a normal filesystem tree (with standard FHS paths) where
every file's data comes from a content-addressed backing store. No symlinks,
no PATH tricks, no `ldconfig`. A binary that expects `/usr/lib/libc.so.6` finds
it there, backed by the store.

### Kernel requirements (already met!)

**Composefs is NOT a separate kernel module.** It is a technique that combines
standard kernel features already available in our kernels:

- **overlayfs** (`CONFIG_OVERLAY_FS=m`) — ✓ available in both NixOS 7.0.2 and Arch 7.0.10
- **EROFS** (`CONFIG_EROFS_FS=m`) — ✓ available in both kernels
- **fs-verity** (optional, for integrity) — available in modern kernels

The userspace tools (`mkcomposefs`, `mount.composefs`) generate an EROFS
metadata image with `trusted.overlay.redirect` xattrs that point overlayfs
to the backing store files. The mount helper orchestrates the overlayfs mount.
No custom kernel needed.

### How it works for Hod

1. **Object store**: A flat directory of files named by content hash
   (hardlinked from the Hod store). Lives inside `@store/objects/`.

2. **composefs image**: Generated per system generation. Contains only
   metadata (directories, permissions, xattrs, redirect pointers). Maps the
   FHS tree: `/usr/bin/bash → objects/sha256:abc123...`, etc.

3. **Mount**: `mount -t composefs composefs.img -o basedir=@store/objects /`

4. **Result**: A read-only FHS filesystem where every file is backed by the
   content-addressed store. Page cache is shared across generations. fs-verity
   provides integrity.

### composefs generation algorithm

```
for each package in system closure:
  for each file in package:
    compute content hash (or use store hash)
    hardlink into @store/objects/sha256:<hash>
    add to composefs directory tree at FHS path:
      /usr/bin/<name> → sha256:<hash>
      /usr/lib/<name> → sha256:<hash>
      etc.

generate composefs image from directory tree
```

Merge conflicts (two packages providing `/usr/bin/foo`):
- Last-wins based on package order in system config
- Build fails if unresolved conflicts exist

## System Configuration (`system.ts`)

```typescript
import { defineSystem } from "@hod/sdk"
import { niri, alacritty, fuzzel, pipewire } from "../recipes/native"

export default defineSystem({
  hostname: "hod-vm",
  timezone: "America/Los_Angeles",
  locale: "en_US.UTF-8",
  kernel: "arch",  // arch distro kernel, or hod recipe hash later

  packages: [
    niri,
    alacritty,
    fuzzel,
    pipewire,
    wireplumber,
    makoNotify,
    // ... the full desktop
  ],

  users: [
    { name: "hod", uid: 1000, groups: ["wheel", "audio", "video", "input"] },
  ],

  groups: [
    { name: "wheel", gid: 10 },
    { name: "audio", gid: 29 },
    { name: "video", gid: 44 },
    { name: "input", gid: 56 },
  ],

  services: {
    enable: [
      "sshd",
      "systemd-networkd",
      "systemd-resolved",
      "pipewire",
      "wireplumber",
    ],
    disable: [],
  },

  boot: {
    kernelArgs: ["quiet", "splash", "loglevel=3"],
  },
})
```

### What gets generated from config

| Config field | Generated output |
|---|---|
| `hostname` | `/etc/hostname`, `/etc/hosts` entry |
| `timezone` | `/etc/localtime` symlink |
| `locale` | `/etc/locale.conf`, `locale-gen` trigger |
| `packages` | composefs image, systemd units, dbus services, tmpfiles rules |
| `users` | `/etc/passwd`, `/etc/group`, `/etc/shadow` |
| `services.enable` | `/etc/systemd/system/<name>.service` → store symlink |
| `services.disable` | `/etc/systemd/system/<name>.service` → `/dev/null` symlink |
| `boot.kernelArgs` | UKI cmdline, boot entry |

## Boot Process

### 1. UEFI → systemd-boot

systemd-boot loads the selected entry (default = latest generation).
Boot counting enabled: if a generation fails N times, auto-fallback.

### 2. UKI → initramfs

The UKI (Unified Kernel Image) bundles kernel + initramfs + cmdline.
The initramfs (Hod custom, dracut or hand-rolled):

```
1. Load btrfs module
2. Mount btrfs partition by label (hod_root)
3. Determine generation to boot:
   - Read /@generations/<hash> from kernel arg or boot entry
4. Mount @store subvolume at /sysroot/usr/hod/store
5. Mount @generations subvolume at /sysroot/usr/hod/system/generations
6. Mount composefs image with basedir=@store/objects at /sysroot
7. Mount @etc-overlay/<hash> as overlayfs over /sysroot/etc
   (lowerdir = generation's generated etc, upperdir = @etc-overlay/<hash>/upper)
8. Mount @var at /sysroot/var
9. Mount @home at /sysroot/home
10. Create symlinks: /bin → usr/bin, /sbin → usr/bin, etc. (if not in composefs)
11. Set /run/booted-system and /run/current-system symlinks
12. switch_root /sysroot /sbin/init (systemd)
```

### 3. systemd starts

systemd runs as PID 1 with units from the composefs + overlay /etc.

## /etc Management

### Structure

```
/etc (overlayfs)
├── [lower: generation's etc/]     ← Generated from system.ts, read-only
└── [upper: @etc-overlay/<hash>/]  ← Runtime changes, read-write
```

### What's in the generated base

- `hostname`, `hosts`, `resolv.conf` (symlink to systemd-resolved stub)
- `passwd`, `group`, `shadow` (from users config)
- `localtime` (timezone symlink)
- `locale.conf`
- `systemd/system/` (service enable/disable symlinks)
- `ssh/sshd_config`
- `nsswitch.conf`
- `pam.d/` (standard PAM config)
- `security/` (basic pam configs)
- Package-provided config files (from recipes' `etc/` outputs)

### What accumulates in the overlay

- `ssh/ssh_host_*_key` (generated on first boot)
- `machine-id`
- `NetworkManager/system-connections/`
- `bluetooth/`
- `pki/`
- Application configs modified at runtime

### 3-way merge on upgrade

When switching to a new generation:

1. If the generated base file changed AND the overlay modified it:
   - Overlay version wins (user preference overrides)
   - Log a warning about the conflict
2. If the generated base file changed AND overlay didn't touch it:
   - New base version takes effect automatically
3. If the generated base file was removed:
   - Check if overlay modified it; if yes, keep it; if no, remove it

Implementation: Compare old generated base vs new generated base diff,
then check if overlay upper layer has a whiteout or copy-up for each changed file.

## Live Activation (`hod system switch`)

For changes that don't require reboot (service changes, config changes):

1. Build new generation (composefs image + /etc + activation script)
2. Create boot entry (for next reboot)
3. Run activation script:
   a. Update `/run/current-system` symlink
   b. Update composefs mount (if possible, or note for reboot)
   c. Update `/etc` overlay lower layer
   d. `systemctl daemon-reload`
   e. Restart changed services (`systemctl restart <service>`)
   f. Start new services, stop removed services
   g. Signal user-space processes to reload config if needed

Changes requiring reboot:
- Kernel change
- Initramfs change
- composefs rootfs change (new/removed binaries or libraries)
- Mount layout changes

## System Commands

```
hod system build [system.ts]       Build a new system generation
hod system switch [system.ts]      Build + activate (live if possible, reboot if needed)
hod system boot [system.ts]        Build + create boot entry (activate on next reboot)
hod system test [system.ts]        Build + activate without creating boot entry
hod system rollback                Set previous generation as boot default
hod system list-generations        List all generations with dates
hod system gc [--delete-older-than 30d]   Garbage collect old generations
hod system verify                  Verify all generations' composefs images against store
```

## Transfer Between Machines

### Option 1: btrfs send/receive (same-filesystem)

```bash
# On build machine: create read-only snapshot of @store
btrfs subvolume snapshot -r @store @snapshots/@store-$(date +%Y-%m-%d)

# First transfer: full send
btrfs send @snapshots/@store-2026-06-05 | ssh target 'btrfs receive /hod_root'

# Subsequent transfers: incremental
btrfs send -p @snapshots/@store-2026-06-05 @snapshots/@store-2026-06-06 | \
  ssh target 'btrfs receive /hod_root'
```

Transfer the generation directory (small: composefs image + kernel + initramfs + etc):
```bash
rsync -a @generations/<hash>/ target:/hod_root/@generations/<hash>/
```

### Option 2: copy-closure (any filesystem)

Already implemented in Hod. Transfer only the store paths needed by the new
generation, plus the generation metadata.

### Option 3: Hybrid

- btrfs send/receive for the bulk of the store (efficient incremental)
- rsync for generation metadata and composefs images
- `hod system boot` on target to create the boot entry

## Garbage Collection

- `hod system gc` removes generations older than specified age
- Only removes generations NOT referenced by any boot entry
- Boot entries are the GC roots for generations
- Store GC (`hod store gc`) removes store paths not referenced by any generation
- btrfs balance can reclaim space from @store subvolume

## Implementation Phases

### Phase 1: Composefs proof of concept — DONE

**Goal**: Mount a composefs root in the current VM backed by the existing store.

- [x] Build `composefs-utils` as a Hod recipe (meson build, C code, needs EROFS headers)
- [x] Write a tool that generates a composefs image from a Hod profile's closure
- [x] Mount the composefs image in the VM, verify FHS paths work
- [x] Run `ls /usr/bin/bash`, `ldd /usr/bin/bash`, confirm it resolves correctly
- [x] Compare composefs approach vs symlink farm for FHS presentation

**Key findings**:
- composefs image: 1.5MB metadata + 414MB object store for 27 packages + 58 transitive deps
- Binaries use AT_EXECFN bootstrap (packed mode) — NOT standard PT_INTERP
- Bootstrap metadata contains a `rel_path` pointing to the staging directory; must be
  patched to `../lib/ld-linux-x86-64.so.2` for FHS layout
- RPATH must also be stripped to `$ORIGIN/../lib` (staging-specific entries cause failures)
- Binaries have PT_INTERP = `/lib64/ld-linux-x86-64.so.2` (standard FHS path, via symlink)
- All 27 profile packages execute correctly from the FHS tree with transitive closure
- composefs requires standard overlayfs + EROFS kernel modules (no custom kernel)

### Phase 2: System generation infrastructure — DONE

**Goal**: `hod system build system.ts` produces a generation directory.

- [x] Define `system.ts` config format and `defineSystem()` SDK function
- [x] Implement config parsing: packages, users, services, hostname, etc.
- [x] Implement /etc generation from config
- [x] Implement composefs image generation with full closure + RPATH patching + bootstrap patching
- [x] Implement generation directory output (composefs.img + /etc + activate)
- [x] Write `hod system build` subcommand (evaluate_system + build_generation + generate_composefs)
- [x] Write `hod system list-generations` subcommand (already existed)

**Key findings from Phase 2a**:
- Full transitive closure: 27 packages → 85 total (27 root + 58 deps), 8557 files
- Two patching steps required on all ELF binaries:
  1. RPATH stripping: staging-specific `$ORIGIN/../../../<hash>/lib` → just `$ORIGIN/../lib`
  2. Bootstrap metadata: `rel_path` pointing to staging dir → `../lib/ld-linux-x86-64.so.2`
- Both patching steps implemented in `scripts/generate-composefs` using patchelf + perl
- 55 binaries had bootstrap metadata, 205 ELF files had RPATH entries
- All binaries verified: curl, git, niri, alacritty, bat, fd, jq, fuzzel, ripgrep, htop, yazi

**Phase 2c implementation**:
- `evaluate_system()` in `src/system.rs` — evaluates system.ts via Bun, parses hostname, users, groups, services, packages
- `generate_etc()` in `src/system.rs` — generates /etc from system config:
  - passwd, group, hostname, hosts, timezone, locale.conf, ld.so.conf, os-release, fstab
  - systemd service enablement symlinks in multi-user.target.wants
- `generate_composefs()` in `src/system.rs` — calls `scripts/generate-composefs` to build FHS tree + composefs image
- `build_generation()` updated to accept optional `SystemConfig` and generate /etc + composefs
- `cmd_system_build_or_activate` updated to use `evaluate_system` and show system info
- `cmd_system_pin` updated to use `evaluate_system`
- `ProfilePackage` now derives `Serialize`/`Deserialize` for JSON embedding
- System config stored as `system.json` in generation directory

**Files created/modified**:
- `js/src/system.ts` — defineSystem() SDK function + SystemConfig types
- `systems/vm-desktop.ts` — sample system config for the niri-desktop VM
- `scripts/generate-composefs` — composefs image generator with closure + patching
- `src/system.rs` — evaluate_system(), generate_etc(), generate_composefs(), SystemConfig types
- `src/profile.rs` — ProfilePackage now serializable
- `src/main.rs` — cmd_system_build_or_activate uses evaluate_system, shows system info

### Phase 3: Boot integration — SUPERSEDED by bootc approach

**This phase is superseded by `plans/hod-os-bootc.md`.** Instead of building our own
initramfs, bootloader, btrfs layout, and partition management, we use the bootc ecosystem
for atomic updates, rollback, and distribution via OCI images.

The store-native boot approach (custom initramfs, btrfs subvolumes, systemd-boot entries)
remains a valid alternative for environments where OCI delivery is not desired.

See `plans/hod-os-bootc.md` for the active implementation plan.

### Phase 4: Live activation — SUPERSEDED

**Superseded by bootc.** `bootc upgrade` handles atomic activation. Live activation
(`hod system switch`) could be added later as an enhancement for non-reboot updates.

### Phase 5: System config expansion — RETAINED

The declarative config expansion is still valuable regardless of delivery mechanism.
System config fields (networking, filesystem mounts, firewall, etc.) generate /etc content
that goes into the OCI image during build.

### Phase 6: Kernel from source — DEFERRED

Building the kernel in Hod is a long-term goal. For now, the base bootc image provides it.

### Phase 7: Distribution — SUPERSEDED by OCI

OCI registry push replaces btrfs send/receive and copy-closure for deployment.
`podman push` + `bootc upgrade` is the distribution mechanism.

## Comparison with existing systems

| Aspect | NixOS | bootc/UBlue | HeliumOS | **Hod OS** |
|--------|-------|-------------|----------|------------|
| Build unit | Nix derivation | RPM/OCI layer | Ansible playbook | **Hod recipe (TypeScript)** |
| Storage | /nix/store | ostree repo | OCI layers | **Hod store → OCI image** |
| FHS compliance | No (patchelf) | Yes (ostree checkout) | Yes (full rootfs) | **Yes (FHS tree in OCI)** |
| Atomic switch | Boot entry | `bootc upgrade` | `bootc upgrade` | **`bootc switch/upgrade`** |
| Auto-rollback | No (manual) | greenboot | No | **bootc boot counting** |
| /etc | Generated (symlinks) | 3-way merge | Generated | **Generated from config** |
| Config language | Nix | Dockerfile + scripts | Ansible YAML | **TypeScript** |
| Live activation | Yes (`switch`) | No | No | **Future** |
| Kernel | Built | Distro | Distro | **Distro → Hod-built** |
| Switch between | N/A | `bootc switch` | `bootc switch` | **`bootc switch`** |

## Key technical risks

| Risk | Mitigation |
|------|------------|
| composefs kernel support | Uses standard overlayfs + EROFS modules (already available) |
| /etc overlay merge conflicts | Overlay wins + warning; rare in practice |
| composefs mount in initramfs | mount.composefs helper is a userspace tool; initramfs just needs overlayfs + erofs modules |
| Performance of composefs with many files | composefs is designed for this (used by OSTree for millions of files) |
| btrfs reliability | Keep regular scrub + balance; btrfs has matured significantly |
| Migration from current Arch rootfs | Phase 1 is non-destructive; overlay on top of existing system |
