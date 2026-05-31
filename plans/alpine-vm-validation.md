# Alpine VM Validation Pass

**Status:** Implemented
**Owner:** core
**Depends on:** `real-store-in-sandbox.md`, `transitive-runtime-closure.md`
**Sequel:** `service-boundary.md`

## Result

The `real-store-in-sandbox` and `transitive-runtime-closure` work passed
end-to-end Alpine VM validation. All 26 binaries in `profiles/minimal-vm.ts`
and all 7 binaries in `profiles/minimal-vm-dev.ts` load and report
`--version` cleanly inside the VM, the deployed env.sh leaves
`LD_LIBRARY_PATH` unset, and wrappers resolve to real ELF on disk.

The validation is now permanent: the new test framework in
`tests/vm/` boots a fresh Alpine VM, deploys both profiles, and runs the
full smoke suite in ~60s, so any future regression to closure transfer or
runtime relocation will be caught the same way.

```
=== results: 41 passed, 1 failed, 0 skipped, 0 errored (61.4s) ===
  boot                ~30s   cold cloud-init under KVM
  deploy minimal-vm   ~22s   26 packages
  deploy minimal-vm-dev  ~7s   7 packages, incremental over minimal-vm
```

The single remaining failure is the `file <binary>` magic-database issue
described below as a follow-up — out of scope for the validation pass per
the original plan.

## What changed

1. `scripts/hod-vm-deploy-profile` now installs the K2 ld-linux symlink on
   the guest as part of every deploy. It scans the deployed package farm
   for the first `lib/ld-linux-x86-64.so.2` and creates
   `/lib64/ld-linux-x86-64.so.2` pointing at it (via `sudo` or `doas`).
   Idempotent. The K2 workaround no longer leaks into the user's mental
   model.
2. New test framework under `tests/vm/`, runnable with
   `scripts/hod-vm-test`. See `tests/vm/README.md` for usage. Highlights:
   - QEMU `-snapshot` so the qcow2 is never mutated.
   - Bun/TypeScript orchestrator drives boot → wait-ssh → deploy → smoke
     → teardown.
   - Declarative test cases per profile, plus a cross-profile
     `invariants` suite that locks in the K1/K2/K4 invariants.
   - Emits `results.json` + a serial console capture for CI/debugging.
3. `scripts/hod-vm-smoke-test` is now a thin compat shim over the new
   framework: `hod-vm-smoke-test minimal-vm` works as the plan called
   for, and so does `minimal-vm-dev` and `invariants`.

## Findings worth tracking

- **`file(1)` cannot find its magic database in deployed env.** `file --version`
  works, but `file /bin/busybox` fails with `could not find any valid magic
  files!`. The recipe needs to either bake `MAGIC` into the wrapper, ship
  the magic db at a path `file` searches by default, or both. Filed as a
  follow-up; out of scope for the validation pass per the original plan.
- **K2 ld-linux automation works on Alpine.** The deploy script created
  `/lib64/ld-linux-x86-64.so.2 ->
  /home/hod/.local/share/hod/staging/d9/d9eb…/sysroot/lib/ld-linux-x86-64.so.2`
  during the test run, and the invariants check confirmed it points into
  the Hod store. On glibc hosts the host already provides this; the link
  is harmless because it points at a Hod copy that matches the host ABI.
- **No `LD_LIBRARY_PATH` regression.** The K4 cleanup holds: `env.sh`
  leaves `LD_LIBRARY_PATH` unset and every binary still loads via
  store-relative `RUNPATH`.
- **No copy-closure errors.** Closure transfer for all 26 packages in
  `minimal-vm` completed in ~21s on bees against a fresh snapshot VM.
- **Cloud-init time.** First-boot cloud-init takes ~29s on bees with KVM,
  which is the dominant cost of a fresh test run. Snapshot mode is still
  worth it for the reproducibility guarantee.

## When this plan is done

This file can stay around as design rationale for the test framework, or
be deleted once `tests/vm/README.md` and the comment in `plans/README.md`
fully cover what's worth remembering. The next active plan is
`service-boundary.md`.
