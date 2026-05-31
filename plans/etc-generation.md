# Hod Unit Generation

**Status:** Active — rescoped after bootc pivot
**Owner:** core
**Depends on:** `hod-system-profile.md`, `bootc-image-builder.md`
**Blocks:** richer service integration after `heartbeat-service-poc.md`

## Why

The pre-bootc plan required Hod to generate most of `/etc` (`passwd`,
`fstab`, `hostname`, systemd units, etc.). With a bootc base, that is no
longer Hod's job. The base image owns the OS substrate and its `/etc`
lifecycle.

Hod still needs to generate **Hod-owned systemd units and drop-ins** that
point at binaries in the Hod layer. This plan keeps only that narrower
surface.

## Scope

In scope:

- A TypeScript helper for describing Hod-owned systemd services, e.g.:
  ```ts
  service({
    name: "hod-heartbeat",
    exec: dep(heartbeatRecipe, "bin/hod-heartbeat"),
    wantedBy: ["multi-user.target"],
    restart: "always",
  })
  ```
- A renderer that emits image-baked units under:
  ```text
  /usr/lib/systemd/system/<name>.service
  /usr/lib/systemd/system/multi-user.target.wants/<name>.service -> ../<name>.service
  ```
- A runtime-layered variant that can emit to:
  ```text
  /etc/systemd/system/<name>.service
  /etc/systemd/system/multi-user.target.wants/<name>.service -> ../<name>.service
  ```
- Documentation of when to use `/usr/lib/systemd/system` (baked image)
  vs `/etc/systemd/system` (runtime override).

Out of scope:

- Full `/etc` generation.
- Users/groups/PAM/shadow.
- fstab, hostname, resolv.conf, machine-id.
- A NixOS-style module system.

## Procedure (sketch)

1. Define a minimal TS unit description type in `js/src/system.ts`.
2. Implement a renderer that produces deterministic unit files from that
   description.
3. Integrate the renderer into the bootc image builder so baked services
   land under `/usr/lib/systemd/system`.
4. Add a runtime helper for `/etc/systemd/system` once runtime-layered
   Hod deployment exists.
5. Use `heartbeat-service-poc.md` as the first real consumer.

## Acceptance criteria

1. ✅ The heartbeat service unit can be generated from a TS description.
2. ✅ The generated unit is deterministic.
3. ✅ Baked-image mode places units under `/usr/lib/systemd/system`.
4. ✅ The unit runs successfully in the bootc VM via
   `heartbeat-service-poc.md`.

## When done

Fold current behavior into `docs/system-profiles.md` or a new
`docs/hod-systemd-units.md`, then mark Implemented.
