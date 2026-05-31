# Bootc Image Builder

**Status:** Implemented — Fedora bootc VM boots end-to-end
**Owner:** core
**Depends on:** `hod-system-profile.md`, `service-boundary.md`
**Blocks:** `heartbeat-service-poc.md`
**Current authority:** `docs/bootc-image-workflow.md`, `scripts/hod-fedora-bootc-build`, `scripts/hod-fedora-bootc-run`

## Why

The service boundary pivoted to a bootc-based architecture: a maintained
bootc base image owns the OS substrate, while Hod provides a baked
content-addressed application/service/desktop layer under `/usr/hod/...`.

This plan creates the first concrete artifact in that direction: a
derived bootc image that contains a Hod store snapshot and a Hod system
profile generation.

## Base choice

**Fedora bootc** from `quay.io/fedora/fedora-bootc:41`.

Started with Bootcrew Arch but it had persistent boot issues (initramfs
can't find root on ext4, GRUB crashes with OVMF). Fedora bootc is the
reference implementation, best documented, and most tested. Arch bootc
scripts are retained for future exploration.

## Scope

In scope:

- A `scripts/hod-bootc-build` (working name) that:
  - Builds or consumes the Bootcrew Arch bootc base image.
  - Builds a Hod system profile locally.
  - Copies the required Hod store closure into the image under
    `/usr/hod/store`.
  - Copies the active generation under `/usr/hod/system/generations/1`
    and creates `/usr/hod/system/current -> generations/1`.
  - Adds minimal tmpfiles config for future `/var/hod` runtime use.
  - Runs `bootc container lint`.
- A `Containerfile.hod-bootc` (or generated Containerfile) that performs
  the image derivation.
- A `scripts/hod-bootc-run` or VM-test integration that turns the image
  into a bootable qcow2 and runs it in QEMU.
- Documentation for the developer loop.

Out of scope:

- COSMIC.
- Runtime-layered `/var/hod` deployment.
- Sophisticated image signing / secure boot.
- Replacing base systemd/kernel/initramfs.

## Procedure (sketch)

1. Clone or vendor a minimal reference to `bootcrew/mono` (probably not
   as a git submodule; prefer script-driven clone into `.hod-vm/bootc/cache`).
2. Build the `arch` image with Bootcrew's `just build arch` flow.
3. Build a small Hod system profile and materialize a generation using
   `hod system activate` with `HOD_SYSTEM_DIR` pointed at a staging dir.
4. Use `hod copy-closure --list` to enumerate the closure for that
   profile's package recipes.
5. Copy closure staging paths into a container build context under
   `hod-store/` and rewrite symlinks as needed so `/usr/hod/system/...`
   points at `/usr/hod/store/...` inside the image, not the host store.
6. Generate a derived `Containerfile`:
   ```Containerfile
   FROM localhost/bootcrew-arch:latest
   COPY hod-store/ /usr/hod/store/
   COPY hod-system/ /usr/hod/system/
   COPY tmpfiles/hod.conf /usr/lib/tmpfiles.d/hod.conf
   RUN bootc container lint
   ```
7. Build image with podman/buildah.
8. Generate qcow2 with Bootcrew's `just disk-image arch` flow or the
   upstream bootc image builder tooling.
9. Boot in QEMU and verify:
   - `bootc status` works.
   - `/usr/hod/system/current` resolves.
   - Hod package binaries run from the baked store.

## Open questions

1. ~~**Symlink rewriting.**~~ **Resolved.** The builder uses `hod store-root` to discover the host store path and rewrites generation symlinks from `$host_store_root/staging/...` to `/usr/hod/store/staging/...` using process substitution.
2. ~~**Store layout in image.**~~ **Resolved.** Uses `/usr/hod/store/staging/<shard>/<hex>` matching Hod's existing layout via `copy-closure --to <local-dir>`.
3. ~~**Tool availability.~~ **Resolved.** Nix dev shell now includes `podman`, `just`, `skopeo`, `buildah`, `bootc`.
4. **Arch image freshness.** Bootcrew is experimental. If the build breaks due to upstream Arch changes, decide quickly whether to switch to Fedora bootc for the spike.

## Acceptance criteria

1. ✅ A derived bootc image builds from a maintained base. (`scripts/hod-fedora-bootc-build`)
2. ✅ The image contains `/usr/hod/store` and `/usr/hod/system/current`. (Containerfile generation)
3. ✅ A qcow2 generated from the image boots in QEMU. (`scripts/hod-fedora-bootc-run`)
4. ✅ Inside the VM, `bootc status` works. (verified: shows `localhost/hod-fedora-bootc:latest`)
5. ✅ Inside the VM, a Hod-baked CLI binary runs from `/usr/hod/...`. (10 packages verified: bat, curl, eza, fd, file, fzf, git, htop, jq, less)
6. ✅ The developer workflow is documented. (`docs/bootc-image-workflow.md`)

## Implemented artifacts

- `scripts/hod-fedora-bootc-build` — derives a Fedora bootc OCI image from `fedora-bootc:41` base + Hod store/generation; builds with rootless podman
- `scripts/hod-fedora-bootc-run` — `bootc install to-filesystem` from Nix host, systemd-boot install, kernel copy to ESP, qcow2 conversion, QEMU boot
- `scripts/hod-bootc-build` — Arch bootc image builder (retained for exploration, not primary)
- `scripts/hod-bootc-run` — Arch bootc VM runner (retained, boot is broken)
- `docs/bootc-image-workflow.md` — developer workflow documentation
- `flake.nix` — added `just`, `podman`, `skopeo`, `buildah`, `bootc`, `ostree`, `OVMF`, `qemu` to dev shell
- `profiles/system-base.ts` — system profile for the bootc image (modern CLI tools)
- `hod store-root` CLI — exposes resolved store path for scripts
- Containerfile generation includes: SSH key auth, `profile.d/hod.sh` for PATH, `systemd-tmpfiles` for `/var/hod`, `sshd.service` enablement
- Symlink rewriting uses `hod store-root` for correct host path detection
- Manual systemd-boot installation bypasses Fedora's broken GRUB (page fault with OVMF)
- `/etc/ostree/prepare-root.conf` on host required by bootc

## Key technical discoveries

1. **Fedora's GRUB 2.12 crashes with OVMF** — workaround: install systemd-boot from Nix host
2. **`bootc install to-disk` re-exec bug in containers** — workaround: run `to-filesystem` from host
3. **systemd-boot only reads vfat** — kernel + initramfs must be on ESP
4. **`/root` is a symlink to `var/roothome`** in both Fedora and Arch bootc images
5. **DNS in podman containers** — systemd-resolved stub at 127.0.0.53 unreachable; use 8.8.8.8/1.1.1.1

## When done

Mark Implemented and start `heartbeat-service-poc.md`.
