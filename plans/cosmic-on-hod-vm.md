# COSMIC on Hod VM

**Status:** Future — unblocks once `heartbeat-service-poc.md` is Implemented
**Owner:** core
**Depends on:** `heartbeat-service-poc.md`, `cosmic-desktop-roadmap.md`
**Sub-plan of:** `minimal-hod-vm-roadmap.md` Phase 4 (graphical session)

## Why

Once the service-boundary phase is done (heartbeat PoC running on the
bootc-based Hod VM), COSMIC is the next big integration. All COSMIC
components are already built (per `cosmic-desktop-roadmap.md`). The
remaining work is baking them into the Hod layer of the derived bootc
image, wiring any required systemd units/drop-ins, and getting a
graphical session running in QEMU.

This file is a placeholder; the full plan gets fleshed out when the
service-boundary work is close to done.

## Sketch

- Use the base image's systemd/logind as the service substrate.
- Build or bake the supporting services COSMIC expects from the Hod
  layer where practical: `xdg-desktop-portal`, PipeWire, WirePlumber,
  and COSMIC portal components.
- Add a `profiles/system-cosmic.ts` system profile that extends
  `system-base.ts` with the COSMIC component set.
- Add unit generation for `cosmic-session`, `cosmic-comp`,
  `cosmic-panel`, etc. Most of these run as user services under
  `cosmic-session.service`'s control rather than as system services.
- Boot the VM. Either auto-launch into COSMIC or land at a TTY and
  start `cosmic-session` manually.
- Validate: window renders (llvmpipe is fine for v1), `cosmic-term`
  opens, `cosmic-files` opens, basic interactions work.
- Add a `tests/vm/cases/cosmic.ts` suite that drives the session via
  whatever automation is feasible (probably scripted Wayland clients
  + screenshot diffs; or just process / port checks for v1).

## Out of scope

- Hardware-accelerated rendering (virtio-gpu) — software rendering
  is fine for v1.
- Multi-user, login manager, lock screen — v1 is single root user
  on serial, then start cosmic manually.
- Audio / Bluetooth / network indicator polish.

## When this plan gets fleshed out

When `heartbeat-service-poc.md` is approaching done. Defer detailed
planning until then; the architectural work above will have surfaced
a lot that's hard to predict in advance.
