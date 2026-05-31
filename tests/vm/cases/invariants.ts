//! Cross-profile invariants.
//!
//! These checks defend the build-system's promises about what a deployed
//! Hod profile environment looks like, independent of which specific
//! packages got deployed.

import type { TestSuite } from "../case.ts";

export const invariantsSuite: TestSuite = {
  name: "invariants",
  cases: [
    {
      name: "alpine base booted",
      run: async ({ vm }) => {
        const r = await vm.exec("cat /etc/os-release");
        if (r.ok && r.stdout.includes("Alpine")) return { status: "pass" };
        return {
          status: "fail",
          message: "expected /etc/os-release to mention Alpine",
          detail: r.stdout + r.stderr,
        };
      },
    },
    {
      name: "cloud-init finished",
      run: async ({ vm }) => {
        const r = await vm.exec("cloud-init status 2>/dev/null || echo absent");
        const out = r.stdout.toLowerCase();
        if (out.includes("done") || out.includes("disabled") || out.includes("absent")) {
          return { status: "pass" };
        }
        return {
          status: "fail",
          message: "cloud-init did not report done/disabled",
          detail: r.stdout + r.stderr,
        };
      },
    },
    {
      name: "/lib64/ld-linux-x86-64.so.2 exists (K2 bootstrap)",
      run: async ({ vm }) => {
        const r = await vm.exec("readlink -f /lib64/ld-linux-x86-64.so.2");
        if (!r.ok) {
          return {
            status: "fail",
            message: "ld-linux-x86-64.so.2 missing — K2 symlink not installed",
            detail: r.stderr,
          };
        }
        if (!r.stdout.includes("/.local/share/hod/")) {
          return {
            status: "fail",
            message: "ld-linux symlink does not point into the Hod store",
            detail: `readlink output: ${r.stdout.trim()}`,
          };
        }
        return { status: "pass", message: r.stdout.trim() };
      },
    },
    {
      name: "minimal-vm env.sh leaves LD_LIBRARY_PATH unset",
      run: async ({ vm }) => {
        const r = await vm.exec(
          'source ~/.hod/profiles/minimal-vm/env.sh && echo "LDLP=${LD_LIBRARY_PATH-UNSET}"',
        );
        if (!r.ok) {
          return { status: "fail", message: `exit ${r.exitCode}`, detail: r.stdout + r.stderr };
        }
        if (!r.stdout.includes("LDLP=UNSET")) {
          return {
            status: "fail",
            message: "LD_LIBRARY_PATH was set by env.sh — K4 regression",
            detail: r.stdout,
          };
        }
        return { status: "pass" };
      },
    },
    {
      name: "minimal-vm wrappers resolve to real ELF",
      run: async ({ vm }) => {
        // ls is a wrapped coreutils binary; its wrapper exec's a sibling
        // .ls-wrapped that must be a real ELF on disk. We resolve the
        // wrapper path with shell parameter expansion (the same idiom the
        // generated wrapper uses) and then check for the ELF magic
        // bytes directly — `file(1)` would also work but its magic db
        // depends on env that isn't set in a fresh login shell.
        const r = await vm.exec(
          [
            "set -eu",
            ". ~/.hod/profiles/minimal-vm/env.sh",
            "lspath=$(command -v ls)",
            'wrapped="${lspath%/*}/.${lspath##*/}-wrapped"',
            'echo "lspath=$lspath"',
            'echo "wrapped=$wrapped"',
            "test -f \"$wrapped\"",
            // First 4 bytes of an ELF: 0x7f 'E' 'L' 'F'.
            'head -c 4 "$wrapped" | od -An -c | tr -d " "',
          ].join("; "),
        );
        if (!r.ok) {
          return {
            status: "fail",
            message: "could not resolve wrapper -> .ls-wrapped",
            detail: r.stdout + r.stderr,
          };
        }
        // od -c output for the ELF header looks like: \177   E   L   F.
        // After `tr -d " "` it collapses to "177ELF".
        if (!/177ELF/.test(r.stdout)) {
          return {
            status: "fail",
            message: "wrapped target is not an ELF",
            detail: r.stdout,
          };
        }
        return { status: "pass" };
      },
    },
    {
      name: "minimal-vm profile roots pinned",
      run: async ({ vm }) => {
        const r = await vm.exec("test -f ~/.hod/roots/profile-minimal-vm.txt && wc -l < ~/.hod/roots/profile-minimal-vm.txt");
        if (!r.ok) {
          return { status: "fail", message: "roots file missing", detail: r.stderr };
        }
        const n = parseInt(r.stdout.trim(), 10);
        if (!Number.isFinite(n) || n < 1) {
          return { status: "fail", message: "roots file empty", detail: r.stdout };
        }
        return { status: "pass", message: `${n} root(s)` };
      },
    },
  ],
};
