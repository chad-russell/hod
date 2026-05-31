# Hod OS: Arch Seed + Direct Kernel Boot

**Status:** Implemented
**Date:** 2026-05-28
**Completed:** 2026-05-29
**Owner:** `scripts/hod-arch-build`, `scripts/hod-arch-run`

## Goal

Build a minimal Hod OS VM from an Arch Linux seed. No bootc, no ostree,
no composefs, no bootloader. Direct kernel boot for the fastest possible
QEMU dev loop. Arch glibc base so `/lib64/ld-linux-x86-64.so.2` exists
natively — no K2 workaround.

## Architecture

```
  QEMU direct kernel boot (-kernel / -initrd / -append)
    |
    v
  Arch kernel (vmlinuz-linux) + custom initramfs
    |
    v
  Bare ext4 rootfs (/dev/vda, no partition table)
    |
    +-- /usr/hod/store/          (Hod content-addressed store)
    +-- /usr/hod/system/         (generation symlink farm)
    +-- /etc/profile.d/hod.sh    (PATH, MANPATH, XDG_DATA_DIRS)
    +-- /usr/lib/systemd/system/ (Hod-owned systemd units)
    |
    v
  systemd -> multi-user.target
    +-- systemd-networkd   (DHCP on all ethernet)
    +-- systemd-resolved   (DNS)
    +-- sshd               (root key auth + serial password)
    +-- hod-heartbeat      (Hod service PoC)
```

## Build pipeline (`scripts/hod-arch-build`)

1. **pacstrap** in `podman run archlinux:latest`:
   - Packages: `base linux systemd openssh mkinitcpio`
   - Strip man pages, docs, info pages, pacman cache

2. **Configure rootfs** (host-side):
   - `/etc/os-release` → `NAME="Hod OS"`
   - `systemd-networkd` → DHCP on `en*`
   - `systemd-resolved` → `/etc/resolv.conf` stub
   - `sshd` enabled, root SSH key from `~/.ssh`
   - Root password (default: `hod`) via `chpasswd` in container chroot
   - Pacman hidden (`chmod -x /usr/bin/pacman`)
   - `/etc/hostname` = `hod`
   - `.bashrc` auto-sources `/etc/profile.d/hod.sh`

3. **Build Hod system profile**:
   - `hod system activate profiles/system-base.ts`
   - 21 packages including `hod-heartbeat`

4. **Bake Hod layer** into rootfs:
   - Copy closure → `/usr/hod/store/`
   - Copy generation → `/usr/hod/system/generations/<N>/`
   - Rewrite symlinks from host store paths to `/usr/hod/store/...`
   - Generate `/etc/profile.d/hod.sh` (iterates `current/pkgs/*/bin`)
   - Discover + install systemd units from `pkgs/*/lib/systemd/system/*.service`

5. **Generate initramfs** (mkinitcpio in container chroot):
   - Modules: `virtio virtio_blk virtio_net virtio_pci ext4`
   - Hooks: `base udev autodetect modconf block filesystems keyboard fsck`

6. **Create disk image**:
   - Bare ext4 filesystem (no partition table)
   - `truncate` → `mkfs.ext4` → `mount -o loop` → `tar` rootfs in → `umount`
   - `qemu-img convert` raw → qcow2

## Run (`scripts/hod-arch-run`)

```
qemu-system-x86_64 \
  -accel kvm -cpu host \
  -kernel .hod-vm/arch/vmlinuz \
  -initrd .hod-vm/arch/initramfs.img \
  -append "root=/dev/vda rw console=ttyS0" \
  -drive file=.hod-vm/arch/hod-arch.qcow2,if=virtio \
  -nic user,model=virtio-net-pci,hostfwd=tcp:10.10.0.6:2223-:22 \
  -m 2048 -smp 2 -nographic
```

Boot in ~2s with KVM. No UEFI, no BIOS, no GRUB, no systemd-boot.

## Why this instead of bootc

- **Simpler:** No ostree/composefs/bootc/GRUB/systemd-boot chain
- **Faster iteration:** Change profile → rebuild disk → boot. No container image layering.
- **Arch glibc base:** No K2 ld-linux workaround. `/lib64/ld-linux-x86-64.so.2` exists.
- **Direct kernel boot:** Fastest QEMU dev loop. Add systemd-boot later for bare metal.
- **No ostree size overhead:** Bare ext4, no composefs metadata.

## Expected user experience

```
Hod OS 0.1 (kernel 6.x.x-arch1-1)
hod login: root
Password: hod
# jq --version          → jq-1.8.1 (from Hod)
# bat --version         → bat 0.25.0 (from Hod)
# systemctl status hod-heartbeat → active (from Hod)
# pacman                → -bash: pacman: command not found
# /usr/bin/pacman       → still there for recovery, but not in PATH
```

## Iteration speed

For package-only changes (no base rootfs change):

```bash
scripts/hod-arch-build --skip-rootfs
```

Skips pacstrap, configuration, and mkinitcpio. Rebuilds only the Hod layer
and disk image (~30s for the disk creation step).

## Acceptance criteria

- [x] `scripts/hod-arch-build` completes end-to-end
- [x] `scripts/hod-arch-run` boots to a login prompt
- [x] Root can log in via serial console (password: `hod`)
- [x] Root can log in via SSH (key auth)
- [x] Hod packages are in PATH (`jq --version` works)
- [x] `hod-heartbeat.service` is active
- [x] `pacman` is hidden from PATH but `/usr/bin/pacman` still works (after `chmod +x`)
- [x] DHCP networking works (can ping external hosts)
- [x] `/etc/os-release` shows `NAME="Hod OS"`

## Implementation notes

- `pacman --root /mnt` instead of pacstrap — rootless podman cannot mount /proc, /sys, /dev
- No arch-chroot possible — all rootfs configuration is host-side file manipulation
- Kernel vmlinuz manually copied from `/usr/lib/modules/<kver>/vmlinuz` (install hook fails without /dev/null)
- sshd user/group/shadow entries created manually (openssh install script needs /dev/null)
- Root password set via `openssl passwd -6` + sed on shadow file
- mkinitcpio runs inside container with symlinked kernel modules (no chroot)
- `tar --owner=0 --group=0` remaps UIDs from host user to root (rootless podman UID mapping)
- `--skip-rootfs` flag skips rootfs creation for package-only rebuilds (~30s for disk step)
