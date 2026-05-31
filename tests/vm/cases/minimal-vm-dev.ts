//! Smoke tests for the `minimal-vm-dev` profile.

import type { TestSuite } from "../case.ts";
import { expectOutput } from "../case.ts";

const profile = "minimal-vm-dev";

const versionChecks: Array<{ name: string; command: string; expected: string | RegExp }> = [
  { name: "bun --version", command: "bun --version", expected: /\d+\.\d+/ },
  { name: "node --version", command: "node --version", expected: /^v\d+/ },
  { name: "python3 --version", command: "python3 --version", expected: "Python 3" },
  { name: "ruff --version", command: "ruff --version", expected: "ruff" },
  { name: "rust-analyzer --version", command: "rust-analyzer --version", expected: "rust-analyzer" },
  { name: "stylua --version", command: "stylua --version", expected: "stylua" },
  { name: "markdown-oxide --version", command: "markdown-oxide --version", expected: /markdown|oxide|\d+\.\d+/ },
];

export const minimalVmDevSuite: TestSuite = {
  name: "minimal-vm-dev",
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
    ...versionChecks.map((c) => ({
      name: c.name,
      run: expectOutput({ command: c.command, expected: c.expected, profile }),
    })),
  ],
};
