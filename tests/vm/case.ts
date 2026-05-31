//! Test case primitives.

import type { QemuVm } from "./vm.ts";
import type { CaseResult, CaseStatus } from "./results.ts";

export interface CaseContext {
  vm: QemuVm;
  /** Group label for reporting (typically the suite name). */
  group: string;
}

export interface TestCase {
  name: string;
  run: (ctx: CaseContext) => Promise<Pick<CaseResult, "status" | "message" | "detail">>;
}

export interface TestSuite {
  name: string;
  /** If set, the suite is skipped unless this profile has been deployed. */
  requiresProfile?: string;
  cases: TestCase[];
}

export async function runCase(c: TestCase, ctx: CaseContext): Promise<CaseResult> {
  const start = Date.now();
  try {
    const r = await c.run(ctx);
    return {
      name: c.name,
      group: ctx.group,
      status: r.status,
      message: r.message,
      detail: r.detail,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name: c.name,
      group: ctx.group,
      status: "error",
      message: err instanceof Error ? err.message : String(err),
      detail: err instanceof Error ? err.stack : undefined,
      durationMs: Date.now() - start,
    };
  }
}

/** Helper: run a remote command and assert stdout contains `expected`. */
export function expectOutput(opts: {
  command: string;
  expected: string | RegExp;
  /** Run the command inside the env of the given profile. */
  profile?: string;
}): TestCase["run"] {
  return async ({ vm }) => {
    const cmd = opts.profile
      ? `source ~/.hod/profiles/${opts.profile}/env.sh && ${opts.command}`
      : opts.command;
    const r = await vm.exec(cmd);
    const matched =
      typeof opts.expected === "string"
        ? r.stdout.includes(opts.expected) || r.stderr.includes(opts.expected)
        : opts.expected.test(r.stdout) || opts.expected.test(r.stderr);
    if (!r.ok) {
      return {
        status: "fail" as CaseStatus,
        message: `command exited ${r.exitCode}`,
        detail: `command: ${cmd}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
      };
    }
    if (!matched) {
      return {
        status: "fail" as CaseStatus,
        message: `output did not match expected`,
        detail: `command: ${cmd}\nexpected: ${opts.expected}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
      };
    }
    return { status: "pass" as CaseStatus };
  };
}
