//! Wrapper around `scripts/hod-vm-deploy-profile`.
//!
//! Keeps the existing bash deploy script as the single source of truth for
//! how a profile gets onto the VM (closure copy + symlink farm + env.sh).
//! We just shell out and surface stderr on failure.

import { spawn } from "bun";

export interface DeployOpts {
  profilePath: string;
  /** Override env vars passed to the deploy script. */
  env?: Record<string, string>;
  /** Repo root (defaults to cwd). */
  cwd?: string;
}

export interface DeployResult {
  ok: boolean;
  exitCode: number;
  /** Combined stdout + stderr from the deploy script. */
  log: string;
  durationMs: number;
}

export async function deployProfile(opts: DeployOpts): Promise<DeployResult> {
  const start = Date.now();
  const env = { ...process.env, ...(opts.env ?? {}) };
  const proc = spawn(["scripts/hod-vm-deploy-profile", opts.profilePath], {
    cwd: opts.cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return {
    ok: exitCode === 0,
    exitCode,
    log: stderr + stdout,
    durationMs: Date.now() - start,
  };
}
