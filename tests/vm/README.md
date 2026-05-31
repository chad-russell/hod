# VM Test Framework

Automated, reproducible smoke tests for the Hod Alpine VM.

## What it does

Boots `.hod-vm/alpine/hod-alpine.qcow2` under qemu in **snapshot** mode (the
on-disk qcow2 is never mutated), waits for SSH and cloud-init to be ready,
deploys one or more profiles via `scripts/hod-vm-deploy-profile`, then runs
declarative test suites against the live guest. Results are emitted in
human-readable form *and* as a JSON artifact for CI consumption.

## Running

From the repo root, inside the project nix dev shell:

```bash
nix develop --accept-flake-config --command scripts/hod-vm-test
```

Common flags (full list: `scripts/hod-vm-test --help`):

| Flag | Purpose |
|------|---------|
| `--profile <path>` | Add a profile to deploy (repeatable). Default: `profiles/minimal-vm.ts` and `profiles/minimal-vm-dev.ts`. |
| `--suite <name>` | Run only the given suite (`invariants`, `minimal-vm`, `minimal-vm-dev`). Repeatable. |
| `--reuse` | Reuse a VM that's already on the SSH port instead of booting a new one. |
| `--skip-deploy` | Skip the deploy phase. Combine with `--reuse` for fast iteration. |
| `--keep-running` | Don't stop the VM after tests; leaves it for manual poking. |

For a quick "is the running VM still healthy?" check you can also use the
backwards-compatible `scripts/hod-vm-smoke-test [profile]`, which is a thin
shim over `--reuse --skip-deploy --suite <profile>`.

## Layout

```
tests/vm/
  index.ts            entry point + arg parsing + lifecycle orchestration
  vm.ts               QemuVm class: snapshot boot, wait-ssh, exec, shutdown
  ssh.ts              SSH/cloud-init readiness primitives
  deploy.ts           thin wrapper around scripts/hod-vm-deploy-profile
  case.ts             TestCase / TestSuite types + expectOutput helper
  results.ts          Reporter + JSON summary types
  cases/
    invariants.ts     cross-profile invariants (K2, LD_LIBRARY_PATH, wrappers, …)
    minimal-vm.ts     per-binary smoke for the CLI userland profile
    minimal-vm-dev.ts per-binary smoke for the dev profile
```

Adding a new test case: append a `TestCase` to the relevant suite. Cases are
plain async functions that take a `vm` handle and return one of `pass | fail | skip | error`. Use `expectOutput({ command, expected, profile })`
for the common "run a command, check stdout" shape.

## Artifacts

Every run writes:

- `.hod-vm/alpine/results.json` — structured summary (phases + per-case results).
- `.hod-vm/alpine/serial.log` — qemu serial console capture from the run.

Both paths are configurable via flags or `HOD_VM_RESULTS` / `HOD_VM_SERIAL_LOG`.

## Why snapshot mode

`-snapshot` makes qemu route all guest writes to a temporary overlay, so the
canonical qcow2 is exactly as `hod-vm-build-alpine` left it. Each test run
exercises the full boot path, including cloud-init, which gives us a strong
guarantee that nothing in our deploy or activation flow depends on hidden
mutable state. The price is ~30s of cold cloud-init each run.

For fast iteration, run the VM separately (`scripts/hod-vm-run-alpine`) and
use `--reuse --skip-deploy` to attach to it.

## What the K2 fix automates

`scripts/hod-vm-deploy-profile` now creates `/lib64/ld-linux-x86-64.so.2`
on the guest, pointing at the first glibc copy it finds in the deployed
closure. This is needed on musl Alpine, harmless elsewhere. The
`invariants/K2 bootstrap` test asserts the symlink resolves into the Hod
store.
