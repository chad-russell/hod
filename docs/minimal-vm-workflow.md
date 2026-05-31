# Minimal VM Workflow

This is the remote-friendly workflow for the first Hod OS VM. The VM runs on
`bees` (`10.10.0.6`), while the ThinkPad (`10.10.0.10`) is the machine used to
connect, observe, and interact with it.

## Shape

- `bees` builds Hod packages and runs QEMU.
- The ThinkPad reaches the guest through forwarded ports on `bees`.
- The first guest is an Alpine cloud-init image because it gives us boot, init,
  networking, SSH, rsync, and recovery login without designing a rootfs yet.
- Hod owns the normal CLI userland through `profiles/minimal-vm.ts`.

## Ports

Default bindings on `bees`:

- `10.10.0.6:2222` forwards to guest SSH port `22`.
- The QEMU serial console stays attached to the SSH session where
  `scripts/hod-vm-run-alpine` is running.
- Later graphical work should bind VNC/SPICE only to `10.10.0.6`, not
  `0.0.0.0`.

From the ThinkPad, the guest is reachable with:

```bash
ssh -p 2222 hod@10.10.0.6
```

The initial test password is `hod` for both `hod` and `root`. This is only for
the local private test VM. Prefer your SSH key for normal access.

## Build The Image

On `bees`:

```bash
nix develop --accept-flake-config
scripts/hod-vm-build-alpine
```

This creates:

- `.hod-vm/alpine/hod-alpine.qcow2`
- `.hod-vm/alpine/seed.iso`
- `.hod-vm/alpine/ssh-config`

The script does not need host root privileges. It downloads an Alpine NoCloud
cloud image, verifies the upstream SHA-512 file, prepares a qcow2 disk, and
creates a NoCloud seed ISO.

## Run The VM

On `bees`:

```bash
nix develop --accept-flake-config
scripts/hod-vm-run-alpine
```

The serial console is shown in that terminal. This is important for remote work:
if SSH or cloud-init fails, the boot log and login prompt are still visible over
your existing SSH session to `bees`.

From the ThinkPad or another shell on `bees`, wait for cloud-init to finish and
then connect:

```bash
ssh -p 2222 hod@10.10.0.6
```

From `bees`, this equivalent command uses the generated SSH config:

```bash
ssh -F .hod-vm/alpine/ssh-config hod-vm
```

## Deploy Hod Userland

With the VM running, deploy the minimal VM profile from `bees`:

```bash
nix develop --accept-flake-config
scripts/hod-vm-deploy-profile profiles/minimal-vm.ts
```

This intentionally does not require a working `hod` binary inside Alpine. The
script builds the profile on `bees`, copies every package closure over SSH/rsync,
then creates the guest profile farm with POSIX shell symlinks.

Smoke test in the guest:

```bash
source ~/.hod/profiles/minimal-vm/env.sh
jq --version
rg --version
eza --version
strace -V
```

Or run the automated smoke test from `bees`:

```bash
nix develop --accept-flake-config
./scripts/hod-vm-smoke-test                # minimal-vm by default
./scripts/hod-vm-smoke-test minimal-vm-dev # alt suite
```

`hod-vm-smoke-test` reuses an already-running VM. For a full end-to-end
validation pass that boots a fresh snapshot VM, deploys the profiles, runs
the invariants + per-profile suites, and tears down, use the test
framework in `tests/vm/`:

```bash
nix develop --accept-flake-config
./scripts/hod-vm-test                      # full default run (~55s on KVM)
./scripts/hod-vm-test --suite invariants   # only the cross-profile invariants
./scripts/hod-vm-test --keep-running       # leave the VM up after tests
```

See `tests/vm/README.md` for the full option list and how to add cases.

New logins for the `hod` user source `minimal-vm/env.sh` automatically once the
profile has been deployed.

## Deploy Developer Tools

With the VM running, deploy the dev profile:

```bash
nix develop --accept-flake-config
./scripts/hod-vm-deploy-profile profiles/minimal-vm-dev.ts
```

Then in the guest:

```bash
source ~/.hod/profiles/minimal-vm-dev/env.sh
bun --version
node --version
python3 --version
ruff --version
```

## Why This Workflow

- It works while QEMU is remote on `bees` and the user is on the ThinkPad.
- Serial console remains available even when guest networking is broken.
- SSH gives normal interactive testing from the ThinkPad.
- Hod profile transfer reuses the existing closure-copy path but avoids needing
  a bootstrap Hod binary inside a musl Alpine guest.
- The base remains small and auditable: Alpine provides only boot/recovery
  infrastructure plus SSH/rsync for deployment.

## Reset

To rebuild from a fresh guest disk:

```bash
rm -f .hod-vm/alpine/hod-alpine.qcow2
scripts/hod-vm-build-alpine
```

If an earlier broken image was created from a non-NoCloud provider image, remove
the cached converted base image too:

```bash
rm -f .hod-vm/alpine/hod-alpine.qcow2 .hod-vm/alpine/cache/base.qcow2
scripts/hod-vm-build-alpine
```

To discard all downloaded VM state:

```bash
rm -rf .hod-vm/alpine
```

## Next Steps

- Add an optional graphical run mode with VNC bound to `10.10.0.6`.
- Move the test framework into `flake.nix` checks so `nix flake check`
  can drive a VM smoke pass.
