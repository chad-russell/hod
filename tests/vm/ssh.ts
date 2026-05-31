//! SSH helpers for talking to the running VM.
//!
//! All operations go over a single `ssh -p <port> <user>@<host>` channel.
//! The host is the qemu hostfwd bind addr (default `10.10.0.6`), the port
//! is the forwarded guest SSH (default `2222`).

export interface SshTarget {
  host: string;
  port: number;
  user: string;
  /** Extra options injected after `-p <port>`. */
  extraOpts?: string[];
  /** Optional path to a known_hosts file to keep host-key state isolated. */
  knownHostsFile?: string;
  /** Optional identity file. */
  identityFile?: string;
}

export interface ExecResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

function baseArgs(t: SshTarget): string[] {
  const args = [
    "-p",
    String(t.port),
    "-o",
    "ConnectTimeout=5",
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "UserKnownHostsFile=" + (t.knownHostsFile ?? "/dev/null"),
    "-o",
    "LogLevel=ERROR",
  ];
  if (t.identityFile) args.push("-i", t.identityFile);
  if (t.extraOpts) args.push(...t.extraOpts);
  return args;
}

/** Run a single command inside the guest. */
export async function ssh(target: SshTarget, command: string): Promise<ExecResult> {
  const proc = Bun.spawn(
    ["ssh", ...baseArgs(target), `${target.user}@${target.host}`, command],
    { stdout: "pipe", stderr: "pipe" },
  );
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { ok: exitCode === 0, exitCode, stdout, stderr };
}

/** Poll until SSH is responsive, or throw after `timeoutMs`. */
export async function waitForSsh(
  target: SshTarget,
  opts: { timeoutMs?: number; intervalMs?: number; onTick?: (elapsedMs: number) => void } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const intervalMs = opts.intervalMs ?? 2_000;
  const start = Date.now();
  let lastErr = "";
  while (Date.now() - start < timeoutMs) {
    const r = await ssh(target, "true");
    if (r.ok) return;
    lastErr = r.stderr.trim();
    opts.onTick?.(Date.now() - start);
    await Bun.sleep(intervalMs);
  }
  throw new Error(
    `SSH did not become ready within ${timeoutMs}ms (last error: ${lastErr || "n/a"})`,
  );
}

/** Wait for cloud-init to finish so the runcmd entries (including profile bootstrap) have run. */
export async function waitForCloudInit(
  target: SshTarget,
  opts: { timeoutMs?: number } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 240_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await ssh(target, "cloud-init status 2>/dev/null || echo 'absent'");
    const status = r.stdout.toLowerCase();
    if (status.includes("done") || status.includes("disabled") || status.includes("absent")) {
      return;
    }
    await Bun.sleep(2_000);
  }
  throw new Error(`cloud-init did not finish within ${timeoutMs}ms`);
}
