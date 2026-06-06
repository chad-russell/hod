set dotenv-load := true

# Defaults can be overridden with environment variables, for example:
#   HOD_REMOTE=builder.example.org just sync-from-remote
#   HOD_STATE_DIR=~/vm/hod just run-local
state_dir := env_var_or_default("HOD_STATE_DIR", ".hod-vm/arch")
profile := env_var_or_default("HOD_PROFILE", "profiles/niri-desktop.ts")
remote := env_var_or_default("HOD_REMOTE", "")
remote_dir := env_var_or_default("HOD_REMOTE_DIR", "/home/crussell/hod")
ssh_port := env_var_or_default("HOD_SSH_PORT", "2223")
bind_addr := env_var_or_default("HOD_VM_BIND_ADDR", "127.0.0.1")
memory := env_var_or_default("HOD_VM_MEMORY", "4096")
cpus := env_var_or_default("HOD_VM_CPUS", "2")
nix := "nix develop --accept-flake-config --command"

default:
    @just --list

# Build the configured VM profile image, reusing the Arch seed rootfs.
build-vm:
    {{nix}} scripts/hod-arch-build --skip-rootfs --profile {{profile}} --state-dir {{state_dir}}

# Full rebuild including the Arch seed rootfs. Slower, but useful after base OS changes.
build-vm-full:
    {{nix}} scripts/hod-arch-build --profile {{profile}} --state-dir {{state_dir}}

# Backwards-compatible alias. Prefer `build-vm` with HOD_PROFILE.
build-cosmic: build-vm

# Backwards-compatible alias. Prefer `build-vm-full` with HOD_PROFILE.
build-cosmic-full: build-vm-full

# Build the small headless/base image, reusing the Arch seed rootfs.
build-base:
    {{nix}} scripts/hod-arch-build --skip-rootfs --profile profiles/system-base.ts --state-dir {{state_dir}}

# Run the VM locally with a QEMU graphics window. Best option on the ThinkPad.
run-local:
    HOD_VM_BIND_ADDR={{bind_addr}} {{nix}} scripts/hod-arch-run --graphics --state-dir {{state_dir}} --ssh-port {{ssh_port}} --memory {{memory}} --cpus {{cpus}}

# Run locally with virtio OpenGL acceleration. Try this if plain virtio-vga is blank.
run-local-gl:
    HOD_VM_BIND_ADDR={{bind_addr}} HOD_VM_GL=1 {{nix}} scripts/hod-arch-run --graphics --state-dir {{state_dir}} --ssh-port {{ssh_port}} --memory {{memory}} --cpus {{cpus}}

# Run the VM with VNC exposed on localhost:5900. Best option for remote smoke tests.
run-vnc:
    HOD_VM_BIND_ADDR={{bind_addr}} {{nix}} scripts/hod-arch-run --vnc --state-dir {{state_dir}} --ssh-port {{ssh_port}} --memory {{memory}} --cpus {{cpus}}

# Run without graphics, using the serial console in the terminal.
run-headless:
    HOD_VM_BIND_ADDR={{bind_addr}} {{nix}} scripts/hod-arch-run --state-dir {{state_dir}} --ssh-port {{ssh_port}} --memory {{memory}} --cpus {{cpus}}

# Copy VM artifacts from a remote builder into this checkout.
sync-from-remote:
    @test -n "{{remote}}" || (printf 'Set HOD_REMOTE, e.g. HOD_REMOTE=builder.example.org just sync-from-remote\n' >&2; exit 2)
    mkdir -p "{{state_dir}}"
    rsync -avz --progress \
      "{{remote}}:{{remote_dir}}/.hod-vm/arch/hod-arch.qcow2" \
      "{{remote}}:{{remote_dir}}/.hod-vm/arch/vmlinuz" \
      "{{remote}}:{{remote_dir}}/.hod-vm/arch/initramfs.img" \
      "{{state_dir}}/"

# Copy VM artifacts to another machine. Run this on the builder.
sync-to target:
    rsync -avz --progress \
      "{{state_dir}}/hod-arch.qcow2" \
      "{{state_dir}}/vmlinuz" \
      "{{state_dir}}/initramfs.img" \
      "{{target}}:{{remote_dir}}/.hod-vm/arch/"

# Print artifact locations and current knobs.
info:
    @printf 'state_dir:  %s\n' "{{state_dir}}"
    @printf 'profile:    %s\n' "{{profile}}"
    @printf 'remote:     %s\n' "{{remote}}"
    @printf 'remote_dir: %s\n' "{{remote_dir}}"
    @printf 'ssh_port:   %s\n' "{{ssh_port}}"
    @printf 'bind_addr:  %s\n' "{{bind_addr}}"
    @printf 'memory:     %s MiB\n' "{{memory}}"
    @printf 'cpus:       %s\n' "{{cpus}}"
    @ls -lh "{{state_dir}}"/hod-arch.qcow2 "{{state_dir}}"/vmlinuz "{{state_dir}}"/initramfs.img 2>/dev/null || true

# Remove generated VM artifacts. Does not touch the Hod store.
clean-vm:
    rm -rf "{{state_dir}}"

# Build, deploy to ThinkPad, restart VM, health-check. Primary test workflow.
test *args:
    scripts/deploy-vm --skip-rootfs --profile {{profile}} {{args}}

# Quick iteration: deploy without rebuilding (image must already be built).
test-quick *args:
    scripts/deploy-vm --skip-build {{args}}

# Health-check the already-running VM on the ThinkPad.
test-check:
    scripts/deploy-vm --check-only

# Full rebuild + deploy (rebuilds Arch rootfs too).
test-full *args:
    scripts/deploy-vm --profile {{profile}} {{args}}
