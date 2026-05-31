# Minimal Hod VM Roadmap

**Status:** Active — top priority
**Date:** 2026-05-26
**Current authority:** This document for product direction; implementation will live in `recipes/`, `profiles/`, `scripts/`, and future image/VM tooling under source control.

## Goal

Build a bootable QEMU VM that starts from the smallest practical Linux base and lets Hod own as much userland, service runtime, and desktop stack as possible. The long-term target is a full graphical desktop OS whose packages and desktop components come from the Hod store, with the non-Hod base shrinking over time toward an LFS-like seed.

This replaces the ThinkPad package-migration goal as the main project direction. The ThinkPad remains useful as a real-machine portability and profile validation target, but it is no longer the primary integration surface.

## Strategy

Start with a modern image-based base that lets us iterate quickly and
debug failures. Do not try to solve kernel, initramfs, package manager,
users, networking, graphics, and desktop all at once.

**2026-05-29 pivot:** the Arch seed + direct kernel boot approach
(`hod-arch-build`/`hod-arch-run`) has replaced bootc as the primary VM
target. It is simpler, faster to iterate, uses Arch glibc natively, and
has no ostree/composefs overhead. The bootc approach still works but is
deprioritized. See `hod-arch-os.md` for the current authority.

Preferred path:

1. Use a minimal base distro or tiny custom rootfs only for boot, kernel, init, device setup, networking, and emergency shell.
2. Install or copy a Hod store and pinned Hod roots into the VM image.
3. Boot into a Hod-provided shell/profile first.
4. Move services and userland into Hod incrementally.
5. Add graphical session support.
6. Build toward a complete Hod-owned desktop stack, reusing the COSMIC work as the desktop phase.

The base is allowed to provide the Linux kernel, bootloader, initramfs,
init system, virtual device plumbing, networking, rollback, and
emergency recovery tools. Hod should own the application/service/desktop
layer above that boundary as soon as practical.

## Minimal Base Options

### Option A: Arch Seed + Direct Kernel Boot — CURRENT

Build a minimal Arch rootfs with `pacman --root` in a rootless podman
container, bake the Hod layer into it, and boot via QEMU direct kernel
boot (`-kernel`/`-initrd`/`-append`). No partition table, no bootloader,
no ostree, no composefs.

**Implemented 2026-05-29.** All acceptance criteria met. See
`hod-arch-os.md` for details.

- `scripts/hod-arch-build` — full pipeline (pacstrap → configure → Hod layer → initramfs → disk image)
- `scripts/hod-arch-run` — QEMU direct kernel boot with SSH forwarding
- 21 Hod packages working (jq, bat, fd, git, rg, etc.)
- SSH, networking, DNS all functional
- `hod-heartbeat.service` active
- Boot in ~2s with KVM

Pros:

- simplest possible approach: bare ext4, no partition table
- fastest iteration: change profile → rebuild disk → boot (~30s for `--skip-rootfs`)
- Arch glibc base: no K2 workaround, `/lib64/ld-linux-x86-64.so.2` exists natively
- no ostree/composefs overhead
- direct kernel boot: fastest QEMU dev loop

Cons:

- no atomic rollback (rebuild entire image to change anything)
- rootless podman limitations: no chroot, no mount, all rootfs config is host-side file manipulation
- `pacman --root` UID mapping requires `tar --owner=0 --group=0` remapping

### Option B: bootc Base Image — WORKING, DEPRIORITIZED

Use a maintained bootc base image and derive a Hod image from it.

Current base: **Fedora bootc** (`quay.io/fedora/fedora-bootc:41`).

**Implemented 2026-05-28.** The bootc image builder is complete:
- `scripts/hod-fedora-bootc-build` derives a Fedora bootc OCI image with baked Hod layer
- `scripts/hod-fedora-bootc-run` creates a qcow2 disk and boots in QEMU
- 10 Hod packages verified working inside the VM
- SSH access, `bootc status`, systemd-boot all functional

Retained as a working alternative but deprioritized in favor of the
simpler Arch seed approach. May return as the bare-metal deployment path
once the direct kernel boot VM is stable.

### Option B: Alpine Base VM — IMPLEMENTED/TRANSITIONAL

Use Alpine as the first practical base. This track has validated Hod's
closure transfer and profile activation story and will be sunset after
the bootc VM is stable.

Pros:

- very small
- simple package manager
- works well in QEMU
- easy to create disk images reproducibly
- good emergency shell story

Cons:

- musl-based host userland differs from Hod's current glibc-native packages
- service integration differs from systemd-based desktop targets
- not the long-term target after the bootc pivot

### Option C: Arch Bootstrap VM — MERGED INTO OPTION A

The original "Arch Bootstrap" concept has been implemented as the Arch
seed + direct kernel boot approach (Option A). No separate plan needed.

### Option D: Custom BusyBox + Kernel Rootfs — FUTURE TRUST REDUCTION

Build a tiny rootfs with BusyBox, kernel modules, device setup, and an init script.

Pros:

- closest to LFS/minimal seed goal
- forces clean Hod/base boundary
- excellent trust-reduction direction

Cons:

- highest boot/debug cost
- no service manager, login stack, networking, graphics, or user management by default
- likely slows desktop progress

## Recommendation

Use the Arch seed + direct kernel boot approach:

- **Current target:** `scripts/hod-arch-build` / `scripts/hod-arch-run`.
- **Bootc:** retained as a working alternative (`scripts/hod-fedora-bootc-build`), may return for bare-metal deployment.
- **Alpine:** keep only until the Arch VM passes equivalent smoke tests; then sunset it.

Do not start with a fully custom BusyBox rootfs unless the explicit task
is trust-base reduction. Keep that as a later phase once the Hod-on-bootc
OS shape is proven.

<!-- Historical pre-bootc options kept below for context in git history only. -->

<!--
### Option A: Alpine Base VM

Use Alpine as the first practical base.

Pros:

- very small
- simple package manager
- works well in QEMU
- easy to create disk images reproducibly
- good emergency shell story

Cons:

- musl-based host userland differs from Hod's current glibc-native packages
- service integration differs from systemd-based desktop targets
- COSMIC/systemd-adjacent work may need a later base transition

### Option B: Arch Bootstrap VM

Use Arch as the first desktop-oriented base.

Pros:

- glibc userland
- systemd available
- closer to modern desktop assumptions
- easier COSMIC/session integration

Cons:

- larger base
- less LFS-like
- easier to accidentally depend on host distro packages

### Option C: Custom BusyBox + Kernel Rootfs

Build a tiny rootfs with BusyBox, kernel modules, device setup, and an init script.

Pros:

- closest to LFS/minimal seed goal
- forces clean Hod/base boundary
- excellent trust-reduction direction

Cons:

- highest boot/debug cost
- no service manager, login stack, networking, graphics, or user management by default
- likely slows desktop progress

## Recommendation

Use a two-track approach:

- **Track 1: Alpine minimal VM** for fast proof that Hod can own most CLI/userland above a tiny base.
- **Track 2: Arch/systemd desktop VM** only when we start integrating graphical sessions and COSMIC.

Do not start with a fully custom BusyBox rootfs unless the explicit task is trust-base reduction. Keep that as a later phase once the Hod-owned OS shape is proven.
-->

## Base/Hod Boundary

The bootc base owns:

- kernel and modules
- bootloader or direct QEMU kernel boot
- initramfs if needed
- init/service manager
- root filesystem mount and composefs/ostree deployment
- `/dev`, `/proc`, `/sys`, `/run`
- networking enough for debugging
- SSH or serial console for recovery
- fallback shell/editor/base package manager as needed for recovery

Hod should own early:

- baked system profiles under `/usr/hod/system`
- baked Hod store snapshots under `/usr/hod/store`
- daily shell/dev tools where we want Hod-built versions
- GUI applications
- desktop libraries and COSMIC components
- Hod-owned systemd units/drop-ins that launch Hod services
- eventually the full COSMIC session/apps layer

The base should not become a hidden package manager for normal userland.
Any base package added beyond boot/recovery/system substrate must be
justified in this plan. Normal application/desktop growth should happen
through Hod recipes and the baked Hod layer.

## Phase 0: VM Image Harness — COMPLETE

**Validated 2026-05-27.** All exit criteria met.

- `scripts/hod-vm-build-alpine` creates an Alpine NoCloud qcow2 and seed ISO.
- `scripts/hod-vm-run-alpine` runs QEMU on `bees` with serial console in the SSH session and guest SSH forwarded on `10.10.0.6:2222`.
- `scripts/hod-vm-deploy-profile` builds/copies profiles from `bees` into the running guest without requiring a working Hod binary inside Alpine.
- `scripts/hod-vm-smoke-test` runs automated smoke tests against the guest over SSH.
- `docs/minimal-vm-workflow.md` documents the remote ThinkPad-to-`bees` testing workflow.

Lessons learned:

- Must use `nocloud_alpine` images, not `gcp_alpine`. The GCP image's cloud-init has an empty datasource search list for local QEMU.
- Alpine's `.sha512` files are bare hex, not `sha512sum` format. The build script compares hashes directly.
- Alpine prefers `doas` over `sudo`. The seed config now installs `doas` and configures `permit nopass :wheel`.

## Phase 1: Hod CLI Userland VM — COMPLETE

**Validated 2026-05-27.** All exit criteria met.

Smoke test results from the running VM:

- `jq-1.8.1`, `ripgrep 15.1.0`, `eza v0.23.4`, `strace 7.0`, plus all 26 profile packages working.
- `bash --version`, `coreutils ls`, `grep`, `sed`, `git`, `curl`, `htop`, `fzf` all verified.
- Runtime deps (glibc `ld-linux`) resolved correctly.
- Profile roots pinned at `~/.hod/roots/profile-minimal-vm.txt`.
- `env.sh` sourced from `.profile` on login.
- Alpine `apk` is available for emergency use but not needed for daily CLI work.

## Phase 2: Hod Dev VM — COMPLETE

**Validated 2026-05-27.** All exit criteria met.

All 33 tools (26 CLI + 7 dev) verified working inside the Alpine VM:

- minimal-vm: `jq-1.8.1`, `ripgrep 15.1.0`, `bash 5.2.37`, `git 2.54.0`, `curl 8.20.0`, `strace 7.0`, `coreutils 9.5`, `grep 3.11`, `sed 4.9`, `bat 0.25.0`, `fd 10.2.0`, `htop 3.5.1`, `tree v2.3.2`, `fzf 0.72.0`, plus `eza`, `file`, `gawk`, `less`, `ncdu`, `openssh`, `pv`, `rsync`, `unzip`, `wget`, `yazi`, `zoxide`.
- minimal-vm-dev: `bun 1.3.14`, `node v22.22.3`, `python3 3.13.13`, `ruff 0.14.6`, `rust-analyzer`, `stylua 2.3.1`, `markdown-oxide v0.25.6`.

Implementation:

- `profiles/minimal-vm-dev.ts` with 7 packages.
- Deploy with: `scripts/hod-vm-deploy-profile profiles/minimal-vm-dev.ts`
- Source both env scripts for full tool access: `source ~/.hod/profiles/minimal-vm/env.sh && source ~/.hod/profiles/minimal-vm-dev/env.sh`

Known blockers:

- npm-distributed tooling (`typescript-language-server`, `pyright`, `prettierd`) needs either a fixed Bun-in-sandbox story or a separate Node/npm packaging helper.

### Infrastructure Fixes Applied (2026-05-27)

Three fixes were needed to make Hod-managed profiles work on a musl Alpine base:

1. **Wrapper scripts used `readlink -f`/`dirname` from PATH** (`src/wrap.rs`). When `env.sh` prepends Hod's `bin/` dirs to PATH, the wrappers found Hod's own `readlink`/`dirname` (which are also wrappers), causing infinite recursion. Fixed by replacing external command calls with pure POSIX shell parameter expansion (`${var%/*}`).

2. **glibc ELF binaries on musl host** need `/lib64/ld-linux-x86-64.so.2` to exist. Currently created manually via `doas ln -sf <staging>/sysroot/lib/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2`. Should be automated in the deploy script.

3. **Recipes with dummy RPATH but no `runtime_deps`** have their ELF RUNPATH never patched by `relocate.rs`, leaving the build-time placeholder that resolves nowhere. Worked around by setting `LD_LIBRARY_PATH` in `env.sh` to all staging `lib/` dirs. Proper fix described below.

### Known Issues to Fix Later

These issues are currently worked around but need proper fixes:

#### K1: Recipes missing `runtime_deps` declarations — BLOCKED by bootstrap-in-sandbox issue

**Problem:** Several recipes (coreutils, grep, sed, gawk, diffutils, findutils, make, patch, tar, bash) set a dummy RPATH (`/aaaa.../dummy`) in their linker flags for later patching by `relocate.rs`, but they don't declare `runtime_deps: ["glibc"]`. Without `runtime_deps`, `relocate.rs` never runs on their outputs, and the ELF RPATH stays as the dummy placeholder. The dynamic linker then cannot find `libc.so.6` at runtime.

**Why adding `runtime_deps` doesn't work (attempted 2026-05-27):** These 10 recipes are used in two contexts:

1. **Standalone (profiles):** Binaries run directly on the host/VM. Need `runtime_deps` for RUNPATH patching + AT_EXECFN bootstrap.
2. **Bundled into toolchain (`recipes/toolchain/native-toolchain.ts`):** Binaries are copied into a single toolchain output and used inside build sandboxes.

The problem is context 2. When a recipe has `runtime_deps`, `relocate.rs` injects the AT_EXECFN bootstrap into the ELF binary. The bootstrap replaces `PT_INTERP` with bootstrap code that locates `ld-linux` using a store-relative path (e.g., `$ORIGIN/../../../<shard>/<hash>/lib/ld-linux-x86-64.so.2`). Inside build sandboxes, the filesystem layout is different: deps are mounted at `/store/<shard>/<hash>/` with symlinks from `/deps/<name>/`. The bootstrap's store-relative path doesn't resolve correctly inside sandboxes, causing "open interp" errors.

Additionally, `relocate.rs` wraps executables (renames ELF to `.*-wrapped`, creates wrapper scripts). The toolchain recipe copies `bin/*` which misses hidden dotfiles, and the wrapper scripts themselves reference store staging paths that don't exist inside sandboxes.

**Workaround:** `env.sh` sets `LD_LIBRARY_PATH` to all staging `lib/` dirs.

**Proper fix (requires build system changes):**

1. **Make bootstrap sandbox-compatible:** The AT_EXECFN bootstrap needs to handle both the store layout (`/store/<shard>/<hex>/bin/binary`) and the sandbox layout (`/deps/<name>/bin/binary`). One approach: the bootstrap could try the store-relative path first, then fall back to `/lib64/ld-linux-x86-64.so.2`. Inside sandboxes, the preamble creates `/lib64/ld-linux-x86-64.so.2`, so the fallback would work.

2. **Separate build output from runtime output:** Expose the pre-relocation (build-only) output hash to downstream recipes. The toolchain could reference the pre-relocation output (which has original `PT_INTERP` and no bootstrap) while profiles use the post-relocation output (with bootstrap). This requires adding a `build_output_hash` field to the recipe metadata or store API.

3. **Don't inject bootstrap, just patch RUNPATH:** For these recipes, patch only RUNPATH (leave `PT_INTERP` as `/lib64/ld-linux-x86-64.so.2`). This works because:
   - Inside sandboxes: preamble creates `/lib64/ld-linux-x86-64.so.2` and `/lib/libc.so.6` → dynamic linker finds everything
   - On VM: `/lib64/ld-linux-x86-64.so.2` symlink + RUNPATH resolves correctly → dynamic linker finds everything
   - Trade-off: not fully portable (requires `/lib64/ld-linux-x86-64.so.2` to exist), but sufficient for VM use

**Affected recipes (all use dummy RPATH, no `runtime_deps`):**
```
recipes/native/bash.ts
recipes/native/coreutils.ts
recipes/native/diffutils.ts
recipes/native/findutils.ts
recipes/native/gawk.ts
recipes/native/grep.ts
recipes/native/make.ts
recipes/native/patch.ts
recipes/native/sed.ts
recipes/native/tar.ts
```

#### K2: `/lib64/ld-linux-x86-64.so.2` must be created manually on musl hosts

**Problem:** glibc-linked ELF binaries have `PT_INTERP` set to `/lib64/ld-linux-x86-64.so.2`. On a musl Alpine host, this file doesn't exist. The kernel's ELF loader fails with `open interp` before any userspace code runs.

**Workaround:** Manually create the symlink:
```bash
doas ln -sf ~/.local/share/hod/staging/d9/<glibc-hash>/sysroot/lib/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2
```

**Fix applied (2026-05-27):** Automated in `scripts/hod-vm-deploy-profile`.
After the symlink farm is created, the deploy script scans the deployed
packages for the first `lib/ld-linux-x86-64.so.2` and creates
`/lib64/ld-linux-x86-64.so.2` pointing at it (via `sudo` or `doas`).
Idempotent. The `tests/vm/cases/invariants.ts` suite locks this in.

#### K3: `copy-closure --ignore-existing` prevents re-deployment — FIXED

**Problem:** `hod copy-closure --to` uses rsync with `--ignore-existing`, which skips files already present on the remote. Re-deploying a profile after rebuilding packages required manually wiping the guest's staging dirs first.

**Fix applied (2026-05-27):** Added `--force` flag to the deploy script's `copy-closure` invocations. This passes `--force` through to rsync, which removes `--ignore-existing` and allows overwriting existing files. `scripts/hod-vm-deploy-profile` line 106 now uses `--force --quiet`.

#### K4: `env.sh` sets `LD_LIBRARY_PATH` that leaks to child processes — FIXED

**Problem:** Earlier `LD_LIBRARY_PATH` workaround (from K1) set the Hod staging lib dirs for all processes, including non-Hod Alpine binaries. This could cause Alpine's musl-linked tools to pick up glibc's `libc.so.6` instead of musl's, or Hod's libraries to interfere with host tool behavior.

**Fix applied (2026-05-27):** With K1 resolved (`real-store-in-sandbox` +
`transitive-runtime-closure`), recipes safely declare `runtime_deps` and
`relocate.rs` patches store-relative RPATH on every relocated binary.
`scripts/hod-vm-deploy-profile` no longer sets `LD_LIBRARY_PATH` in the
generated `env.sh`. The `tests/vm/cases/invariants.ts` suite asserts
`LD_LIBRARY_PATH` stays unset after sourcing `env.sh`.

## Phase 3: Service Boundary — COMPLETE

### Phase 3a: Bootc Image Builder — COMPLETE

**Validated 2026-05-28.** All acceptance criteria met.

- Fedora bootc (`fedora-bootc:41`) selected as primary base after Bootcrew Arch had persistent boot failures.
- `scripts/hod-fedora-bootc-build` derives a bootc OCI image with baked Hod store + system profile.
- `scripts/hod-fedora-bootc-run` creates a qcow2 disk via `bootc install to-filesystem` from the Nix dev shell host, installs systemd-boot (bypassing Fedora's broken GRUB), copies kernel/initramfs to ESP, and boots with QEMU+KVM+OVMF.
- 10 Hod packages verified: bat, curl, eza, fd, file, fzf, git, htop, jq, less.
- SSH with ed25519 key authentication works.
- `bootc status` reports `localhost/hod-fedora-bootc:latest`.
- `/etc/profile.d/hod.sh` sets PATH for Hod packages.
- Disk image: ~3.0GB qcow2, GPT partitions, ext4 root, systemd-boot.

### Phase 3b: Heartbeat Service PoC — COMPLETE

**Validated 2026-05-29.** `hod-heartbeat.service` runs in both the
Fedora bootc VM and the Arch seed VM. See `heartbeat-service-poc.md`.

### Phase 3c: Arch Seed VM — COMPLETE

**Validated 2026-05-29.** All acceptance criteria met. See `hod-arch-os.md`.

- `scripts/hod-arch-build` + `scripts/hod-arch-run` provide the fastest dev loop.
- 21 Hod packages working, SSH, networking, DNS all functional.
- Replaces bootc as the primary VM target.

## Phase 4: Minimal Graphical Session

Exit criteria:

- VM boots to a graphical session or launches one from console
- a Hod-built terminal opens
- Wayland clipboard/screenshot/basic utilities work
- software rendering is acceptable initially

Initial candidates:

- `alacritty`
- `grim`
- `slurp`
- `wl-clipboard`
- `brightnessctl` only if meaningful in VM
- a simple compositor first if COSMIC is too heavy for initial bring-up

Graphics policy:

- start with QEMU virtio-gpu and software rendering if needed
- do not block on perfect GPU acceleration
- prefer clear runtime dependency closure over host GPU magic

## Phase 5: Full Desktop Stack

Exit criteria:

- VM can run a complete desktop session from Hod store packages
- desktop apps launch from Hod profiles
- closure copy/image rebuild is repeatable
- base distro is still minimal and documented

This phase reuses `cosmic-desktop-roadmap.md`. COSMIC remains the preferred full desktop target, but it is now a sub-plan of the minimal Hod VM OS effort rather than the whole project goal.

## Phase 6: Trust-Base Reduction

Exit criteria:

- base distro dependencies are audited
- pieces of the base are replaced by Hod-built equivalents where practical
- rootfs creation is deterministic and documented
- long-term path toward a BusyBox/LFS-like base is clear

Candidates:

- base shell/coreutils replacement
- base network tools replacement
- initramfs generation
- kernel build policy
- service manager policy
- package manager removal from runtime image

## Near-Term Implementation Order

1. Create `profiles/minimal-vm.ts` from already-proven CLI/dev recipes. **Done.**
2. Add a script that builds or assembles a minimal Alpine QEMU disk image. **Done.**
3. Copy/pin `profiles/minimal-vm.ts` into the image or into a running VM. **Done.**
4. Boot and smoke test the Hod profile from serial console. **Done — all 26 packages verified.**
5. Add a dev profile for the VM. **Done — `profiles/minimal-vm-dev.ts`, all 7 packages verified.**
6. Fix `copy-closure` re-deployment by adding `--force` to deploy script. **Done (K3).**
7. Resolve bootstrap-in-sandbox issue so bundled recipes can declare `runtime_deps` (K1).
8. Decide whether the first graphical VM should stay Alpine or move to an Arch/systemd base.
9. Resume COSMIC desktop integration once the VM harness is repeatable.

## Non-Goals For The First VM

- no secure boot
- no disk encryption
- no multi-user hardening beyond basic login
- no full source-built kernel requirement
- no package-manager-free custom rootfs on day one
- no proprietary GPU driver support

## Success Metric

The project succeeds when a fresh VM can boot from a minimal base, activate Hod profiles, and run a growing desktop environment where each new userland capability is added by Hod rather than by the base distro package manager.
