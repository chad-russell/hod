//! Smoke tests for the `minimal-vm` profile.
//!
//! These mirror the per-binary `--version` checks in the legacy
//! `scripts/hod-vm-smoke-test`, but expressed declaratively so they can be
//! reported individually and extended easily.

import type { TestSuite } from "../case.ts";
import { expectOutput } from "../case.ts";

const profile = "minimal-vm";

const versionChecks: Array<{ name: string; command: string; expected: string | RegExp }> = [
  { name: "bash --version", command: "bash --version", expected: "GNU bash" },
  { name: "coreutils ls", command: "ls --version", expected: /coreutils|GNU/ },
  { name: "grep --version", command: "grep --version", expected: "GNU grep" },
  { name: "sed --version", command: "sed --version", expected: /GNU|sed/ },
  { name: "gawk --version", command: "gawk --version", expected: "GNU Awk" },
  { name: "jq --version", command: "jq --version", expected: "jq" },
  { name: "ripgrep --version", command: "rg --version", expected: "ripgrep" },
  { name: "fd --version", command: "fd --version", expected: "fd" },
  { name: "bat --version", command: "bat --version", expected: "bat" },
  { name: "eza --version", command: "eza --version", expected: "eza" },
  { name: "git --version", command: "git --version", expected: "git version" },
  { name: "curl --version", command: "curl --version", expected: "curl" },
  { name: "wget --version", command: "wget --version", expected: /Wget|wget/ },
  { name: "strace -V", command: "strace -V", expected: "strace" },
  { name: "htop --version", command: "htop --version", expected: "htop" },
  { name: "fzf --version", command: "fzf --version", expected: /fzf|\d+\.\d+/ },
  { name: "less --version", command: "less --version", expected: "less" },
  { name: "tree --version", command: "tree --version", expected: /tree v?\d+/ },
  { name: "ncdu --version", command: "ncdu -v", expected: "ncdu" },
  { name: "rsync --version", command: "rsync --version", expected: "rsync" },
  { name: "pv --version", command: "pv --version", expected: "pv" },
  { name: "openssh ssh -V", command: "ssh -V", expected: "OpenSSH" },
  { name: "unzip -v", command: "unzip -v", expected: "UnZip" },
  { name: "yazi --version", command: "yazi --version", expected: /yazi|\d+\.\d+/ },
  { name: "zoxide --version", command: "zoxide --version", expected: "zoxide" },
  { name: "file --version", command: "file --version", expected: "file" },
];

export const minimalVmSuite: TestSuite = {
  name: "minimal-vm",
  requiresProfile: profile,
  cases: [
    {
      name: "env.sh sets HOD_PROFILE",
      run: expectOutput({
        command: 'echo "HOD_PROFILE=$HOD_PROFILE"',
        expected: `HOD_PROFILE=${profile}`,
        profile,
      }),
    },
    // Functional test: `file /bin/ls` exercises the magic database, which
    // depends on `file` finding share/misc/magic.mgc. If the recipe doesn't
    // bake the right path or the wrapper doesn't surface it, this fails
    // even though `file --version` passes.
    {
      name: "file recognizes a known binary",
      run: expectOutput({
        command: "file /bin/busybox 2>&1 || file $(command -v sh) 2>&1",
        expected: /ELF|script|symbolic link/,
        profile,
      }),
    },
    ...versionChecks.map((c) => ({
      name: c.name,
      run: expectOutput({ command: c.command, expected: c.expected, profile }),
    })),
  ],
};
