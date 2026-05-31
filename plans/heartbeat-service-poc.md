# Heartbeat Service PoC

**Status:** Implemented
**Owner:** core
**Sub-plan of:** `service-boundary.md`

## Why

Proves that a Hod-built service can be launched by the base systemd from
the baked Hod layer. The service itself is intentionally trivial — the PoC
is about the *infrastructure* that gets it running: recipe → baked
store/profile → systemd unit → running service.

## Scope

In scope:

- A new tiny recipe `recipes/native/hod-heartbeat/heartbeat.ts` that
  builds a single bash (or static C) program:
  ```
  #!/bin/sh
  while :; do
    printf '%s heartbeat from %s\n' "$(date -Iseconds)" "$0" >> /var/log/hod-heartbeat.log
    sleep 10
  done
  ```
  (Using a static C is more honest about the deploy path; using bash
  reuses existing dependencies. Pick C if it's not painful.)
- A generated systemd unit placed in the bootc image at
  `/usr/lib/systemd/system/hod-heartbeat.service`, pointing at the
  heartbeat binary under `/usr/hod/system/current/...`.
- An update to `tests/vm/cases/` adding a new `services` suite that
  asserts:
  - `systemctl is-active hod-heartbeat` returns `active`.
  - `journalctl -u hod-heartbeat` contains heartbeat lines from the
    last minute.
  - `systemctl restart hod-heartbeat` works and leaves the service
    active.
  - `systemctl stop` then `start` produce expected log output.

Out of scope:

- Anything desktop-related.
- D-Bus services beyond what systemd already needs.
- User-instance services (this is a system service).

## Procedure (sketch)

1. Add the heartbeat recipe.
2. Add a systemd-unit renderer in `etc-generation.md`'s helpers. In
   baked-image mode it produces:
   - `/usr/lib/systemd/system/hod-heartbeat.service`
   - `/usr/lib/systemd/system/multi-user.target.wants/hod-heartbeat.service` symlink
3. Add `hod-heartbeat` to `profiles/system-base.ts`.
4. Build the derived bootc image via `bootc-image-builder.md` and boot it.
5. Add the `services` test suite. Run.
6. Iterate any rough edges in the unit-generation helper. The next
   sub-plan (COSMIC) builds heavily on this helper.

## Open questions

1. **Where do logs go?** systemd's journal is the obvious answer,
   but our heartbeat writes a log file as well to validate
   filesystem-write paths. Decide whether that's idiomatic or
   superfluous.
2. **Service user.** Run as root for v1. A `DynamicUser=yes`
   directive would be cleaner but pulls in nss-systemd correctness
   we may not yet have.
3. **Restart policy.** `Restart=always`? Probably yes; it makes the
   "stop then start" test more interesting.

## Acceptance criteria

1. ✅ The heartbeat recipe builds in the sandbox.
2. ✅ A `profiles/system-base.ts` build that includes
   hod-heartbeat produces a baked image with the unit symlinked
   into `/usr/lib/systemd/system/multi-user.target.wants/`.
3. ✅ Booting the resulting VM image runs the service; `systemctl
   is-active hod-heartbeat` returns `active`.
4. ✅ Verified in both Fedora bootc VM and Arch seed VM.
5. ✅ `systemctl is-active hod-heartbeat` returns `active` in the Arch seed VM.

## Risks

- Low. The deps are real, but the surface here is intentionally
  small. If something fails here, it almost certainly indicates a
  defect in `etc-generation.md` or `bootc-image-builder.md` rather than
  this plan.

## When done

Done. `hod-heartbeat.service` runs in both the Fedora bootc VM and the
Arch seed VM. See `hod-arch-os.md` for the current primary target.
