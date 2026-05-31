//! Result types and reporter for VM tests.

export type CaseStatus = "pass" | "fail" | "skip" | "error";

export interface CaseResult {
  name: string;
  group: string;
  status: CaseStatus;
  /** Wall-clock duration in ms. */
  durationMs: number;
  /** Brief one-line message; longer detail goes in `detail`. */
  message?: string;
  /** Multi-line diagnostic output (stdout/stderr, expected vs got, etc.). */
  detail?: string;
}

export interface RunSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  /** Phase-level events captured during the run (boot, deploy, etc.). */
  phases: Array<{ name: string; durationMs: number; ok: boolean; message?: string }>;
  cases: CaseResult[];
  pass: number;
  fail: number;
  skip: number;
  error: number;
}

export class Reporter {
  private cases: CaseResult[] = [];
  private phases: RunSummary["phases"] = [];
  private startedAt: number;

  constructor() {
    this.startedAt = Date.now();
  }

  recordPhase(name: string, durationMs: number, ok: boolean, message?: string): void {
    this.phases.push({ name, durationMs, ok, message });
    const tag = ok ? "ok" : "FAIL";
    process.stdout.write(`  [phase ${tag}] ${name} (${(durationMs / 1000).toFixed(1)}s)`);
    if (message) process.stdout.write(` — ${message}`);
    process.stdout.write("\n");
  }

  recordCase(result: CaseResult): void {
    this.cases.push(result);
    const tag = result.status === "pass" ? "PASS" : result.status === "skip" ? "SKIP" : "FAIL";
    const ms = `${result.durationMs}ms`.padStart(7);
    process.stdout.write(`  [${tag}] ${result.group}/${result.name} ${ms}`);
    if (result.message) process.stdout.write(` — ${result.message}`);
    process.stdout.write("\n");
    if (result.status === "fail" || result.status === "error") {
      if (result.detail) {
        for (const line of result.detail.split("\n")) {
          process.stdout.write(`        ${line}\n`);
        }
      }
    }
  }

  groupHeader(name: string): void {
    process.stdout.write(`\n=== ${name} ===\n`);
  }

  summarize(): RunSummary {
    const finishedAt = Date.now();
    const summary: RunSummary = {
      startedAt: new Date(this.startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - this.startedAt,
      phases: this.phases,
      cases: this.cases,
      pass: this.cases.filter((c) => c.status === "pass").length,
      fail: this.cases.filter((c) => c.status === "fail").length,
      skip: this.cases.filter((c) => c.status === "skip").length,
      error: this.cases.filter((c) => c.status === "error").length,
    };
    return summary;
  }
}

export function exitCodeFor(summary: RunSummary): number {
  if (summary.fail > 0 || summary.error > 0) return 1;
  if (summary.cases.length === 0) return 2; // nothing ran
  return 0;
}
