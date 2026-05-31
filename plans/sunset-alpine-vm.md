# Sunset Alpine VM

**Status:** Active — seventh sub-plan of `service-boundary.md`
**Owner:** core
**Depends on:** `heartbeat-service-poc.md`
**Blocks:** none

## Why

Per `service-boundary.md` D8, once the Fedora bootc VM is stable and the
heartbeat PoC has validated the full deploy path, the Alpine VM track is
retired. Maintaining two parallel VM tracks doubles the surface area for
regression testing and creates ambiguity about which is the "Hod OS."

This sub-plan is a small cleanup pass, not a re-architecting. It
runs after the new VM has been used as the canonical test target for
some time and is uncontroversially better.

## Scope

In scope:

- Move `scripts/hod-vm-build-alpine`, `scripts/hod-vm-run-alpine`
  into `scripts/legacy/` (or delete outright; depends on whether
  anyone still uses them).
- Update `scripts/hod-vm-deploy-profile` to default to the new VM,
  with the option to deploy to either via a flag if both are
  available during the transition.
- Update `tests/vm/` to default to the new VM. The `cases/` files
  stay; only the boot/deploy lifecycle changes.
- Update `docs/minimal-vm-workflow.md` to be about the new VM. Move
  the Alpine-specific bits into a short historical note in
  `plans/README.md` or delete entirely.
- Remove the `profiles/minimal-vm.ts` and
  `profiles/minimal-vm-dev.ts` if they're superseded by
  `profiles/system-base.ts` + a new `profiles/system-dev.ts`. (Or
  keep them as user-profile-style add-ons; decide at sunset time.)

Out of scope:

- Anything that's not removal/relocation. New features go in their
  own plans.
- Public-facing announcements; this is a private project.

## Procedure (sketch)

1. Confirm the new VM has been the canonical test target for at
   least a few weeks of active development.
2. Run both Alpine and Arch test suites once more for the record.
3. Move/delete the Alpine scripts, profiles, and docs.
4. Update `AGENTS.md` and `docs/README.md` to reference only the new
   VM.
5. Update `plans/README.md` to mark `alpine-vm-validation.md` as
   historical (already Implemented; this just adds a note).
6. Commit.

## Open questions

1. **Move or delete?** If anyone still runs the Alpine VM for any
   reason, move to `scripts/legacy/`. Otherwise delete and rely on
   git history. Default: delete.
2. **Alpine-specific tests in `tests/vm/cases/`?** Almost all test
   cases are profile-shape, not Alpine-specific. Audit at sunset
   time and delete only the ones that mention Alpine specifically.

## Acceptance criteria

1. ✅ `scripts/hod-vm-test` runs only against the new VM by default.
2. ✅ All Alpine-specific scripts and profiles are either deleted
   or moved under `scripts/legacy/`.
3. ✅ Documentation has been updated to remove references to the
   Alpine VM as the current target.
4. ✅ A final smoke run on the new VM passes.

## Risks

- Low. This is cleanup, not new design. The risk is doing it too
  early; mitigation is the "few weeks of active use" gate.

## When done

Mark Implemented. Update `service-boundary.md` row 7. The
service-boundary phase is complete.
