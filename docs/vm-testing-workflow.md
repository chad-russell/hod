# VM Testing Workflow

## Architecture

```
Build machine (10.10.0.6)           ThinkPad (10.10.0.10)
  NixOS, fast builds                 NixOS, has GPU
       |                                  |
       | just test                        |
       |  1. hod-arch-build               |
       |  2. rsync qcow2 ---------------> |
       |  3. restart QEMU                 |  QEMU + VirGL + SPICE
       |  4. health-check via SSH -------> |
       |                                  |
       |                                  |  virt-viewer --spice-unix=...
```

- All building happens on the build machine.
- The finished qcow2 image is rsync'd to the ThinkPad.
- QEMU runs on the ThinkPad with VirGL GPU acceleration and SPICE display.
- The ThinkPad run script is synced from `scripts/run-vm-thinkpad` automatically.

## Commands

### Primary test loop

```bash
just test              # Build (skip rootfs) → deploy → restart → health-check
just test-quick        # Deploy existing image without rebuilding
just test-full         # Full rebuild including Arch rootfs, then deploy
just test-check        # Health-check the running VM without redeploying
```

### Connecting to the display

On the ThinkPad after `just test` completes:

```bash
virt-viewer --spice-unix=~/.cache/hod-vm-spice.sock
```

### SSH into the VM

From any machine on the network:

```bash
# Direct from ThinkPad
ssh -p 2222 root@localhost

# From build machine (double-hop)
ssh crussell@10.10.0.10 'ssh -p 2222 root@localhost'
```

### Local testing on build machine

For quick smoke tests without the ThinkPad (no GPU acceleration):

```bash
just run-vnc            # VNC on :5900
just run-headless        # Serial console only
```

## Key files

| File | Purpose |
|------|---------|
| `scripts/deploy-vm` | Build → deploy → restart → health-check pipeline |
| `scripts/run-vm-thinkpad` | QEMU launcher for ThinkPad (auto-synced on deploy) |
| `scripts/hod-arch-build` | VM image builder |
| `scripts/hod-arch-run` | Local QEMU runner (build machine) |
| `profiles/niri-desktop.ts` | Desktop profile with niri, fuzzel, mako, pipewire |

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `HOD_PROFILE` | `profiles/niri-desktop.ts` | Profile to build |
| `HOD_STATE_DIR` | `.hod-vm/arch` | Build state directory |

## Troubleshooting

### VM won't boot / SSH not responding

```bash
# Check serial log on ThinkPad
ssh crussell@10.10.0.10 'tail -30 ~/.cache/hod-vm-serial.log'
```

### QEMU not starting on ThinkPad

```bash
# Check QEMU log
ssh crussell@10.10.0.10 'cat /tmp/hod-qemu.log'
# Clean up stale sockets and restart
ssh crussell@10.10.0.10 'pkill -f qemu; rm -f ~/.cache/hod-vm-spice.sock; bash ~/Code/hod/run-vm.sh &'
```

### Desktop issues inside VM

```bash
# Check niri session log
ssh crussell@10.10.0.10 'ssh -p 2222 root@localhost "tail -20 /home/hod/.local/share/niri/hod-session.log"'
```
