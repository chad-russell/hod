# Bootc Image Builder Workflow

Build a bootable Hod OS VM as a derived bootc image: a maintained base
(Fedora bootc) provides kernel/systemd/init, while Hod provides a baked
content-addressed application layer under `/usr/hod/...`.

## Prerequisites

Run everything inside the Nix dev shell:

```bash
nix develop --accept-flake-config
```

The dev shell provides `podman`, `bootc`, `ostree`, `just`, `qemu-system-x86_64`,
`skopeo`, `buildah`, and `bun`.

## One-time setup

1. Ensure podman is configured for rootless operation:

```bash
podman info >/dev/null 2>&1 || echo "podman needs setup"
```

2. Ensure `/etc/ostree/prepare-root.conf` exists on the host (required by
   `bootc install to-filesystem`):

```bash
sudo mkdir -p /etc/ostree
cat /etc/ostree/prepare-root.conf
# Should contain at least:
# [composefs]
# enabled=yes
```

3. If DNS fails inside podman containers (systemd-resolved stub unreachable),
   configure real DNS:

```bash
mkdir -p ~/.config/containers
cat > ~/.config/containers/containers.conf <<'EOF'
[containers]
dns_servers = ["8.8.8.8", "1.1.1.1"]
EOF
```

## Full build

```bash
# 1. Build the derived Fedora bootc image (base + Hod layer)
scripts/hod-fedora-bootc-build

# 2. Generate a qcow2 disk and boot in QEMU
scripts/hod-fedora-bootc-run
```

## Iterative workflow

After the initial build, you can skip expensive steps:

```bash
# Rebuild after changing the Hod profile (skip base image pull)
scripts/hod-fedora-bootc-build --skip-base-pull

# Regenerate the disk and boot
scripts/hod-fedora-bootc-run --force
```

## Connecting to the VM

```bash
# SSH (default)
ssh -i ~/.ssh/id_ed25519 -p 2223 root@10.10.0.6

# Serial console (via QEMU -nographic)
# The VM outputs to serial; if running with -nographic, the terminal
# is the serial console. Log in as root (no password).
```

## Image layout

Inside the derived bootc image:

```text
/usr/hod/
  store/
    staging/<shard>/<hex>/      # Hod content-addressed store outputs
    recipes/<shard>/<hex>       # binary recipe files
  system/
    generations/<n>/
      pkgs/<name> → /usr/hod/store/staging/<shard>/<hex>
      runtime/<dep> → /usr/hod/store/staging/<shard>/<hex>
      metadata.json
    current → generations/<n>
/etc/profile.d/hod.sh           # sets PATH for Hod packages
/usr/lib/tmpfiles.d/hod.conf    # creates /var/hod at runtime
```

The baked approach means `bootc upgrade` updates the base OS and the Hod
layer together atomically. Future work adds runtime-layered `/var/hod/...`
for faster iteration.

## Verification inside the VM

```bash
bootc status
ls -la /usr/hod/system/current
export PATH=/usr/hod/system/current/pkgs/jq/bin:$PATH
jq --version
rg --version
bat --version
```

## Default profile

The default profile is `profiles/system-base.ts` — modern CLI tools that
complement the Fedora base. The profile adds bat, curl, eza, fd, file, fzf,
git, htop, jq, and less.

Override with:

```bash
scripts/hod-fedora-bootc-build --profile profiles/thinkpad-dev.ts
```

## Troubleshooting

**Base image pull fails:** Check DNS inside podman. Use the `containers.conf`
setup above if systemd-resolved's stub is unreachable.

**`bootc install to-filesystem` fails with bootloader error:** The bootloader
install step is known to fail; `hod-fedora-bootc-run` ignores this error and
installs systemd-boot manually. If the ostree deployment itself fails, check
that `/etc/ostree/prepare-root.conf` exists on the host.

**GRUB crashes with OVMF:** Fedora's GRUB 2.12 has a known page fault with
UEFI firmware. The run script bypasses this by installing systemd-boot from
the NixOS host instead.

**Symlinks broken in VM:** The builder rewrites generation symlinks from
host store paths to `/usr/hod/store/...`. If symlinks still point at the
host path, check the rewrite log output from `hod-fedora-bootc-build`.
