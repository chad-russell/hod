//! QEMU VM lifecycle for VM tests.
//!
//! Boots the existing Hod Alpine qcow2 with `-snapshot`, exposing the guest
//! SSH on a forwarded port. The base disk is never mutated, so every
//! `start()` runs cloud-init from scratch and produces a clean baseline.

import { spawn, type Subprocess } from "bun";
import { existsSync, mkdirSync, openSync, closeSync } from "fs";
import { dirname } from "path";
import { ssh, waitForSsh, waitForCloudInit, type SshTarget, type ExecResult } from "./ssh.ts";

export interface VmConfig {
  /** Path to the Hod Alpine qcow2. */
  diskImage: string;
  /** Path to the cloud-init seed iso. */
  seedIso: string;
  /** Path where the serial console log is written. */
  serialLog: string;
  /** Bind address for forwarded ports (e.g. `10.10.0.6` on bees). */
  bindAddr: string;
  /** Forwarded SSH port. */
  sshPort: number;
  /** Guest user. */
  user: string;
  /** Memory in MiB. */
  memoryMiB?: number;
  /** vCPUs. */
  cpus?: number;
  /** Use KVM if available (default true). Falls back to TCG if `/dev/kvm` not usable. */
  useKvm?: boolean;
  /** Extra qemu args. */
  extraQemuArgs?: string[];
}

export class QemuVm {
  private proc: Subprocess<"ignore", "ignore", "ignore"> | null = null;
  readonly config: VmConfig;

  constructor(config: VmConfig) {
    this.config = config;
  }

  get sshTarget(): SshTarget {
    return {
      host: this.config.bindAddr,
      port: this.config.sshPort,
      user: this.config.user,
    };
  }

  async start(): Promise<void> {
    if (this.proc) throw new Error("VM already started");
    if (!existsSync(this.config.diskImage)) {
      throw new Error(`disk image not found: ${this.config.diskImage}`);
    }
    if (!existsSync(this.config.seedIso)) {
      throw new Error(`seed iso not found: ${this.config.seedIso}`);
    }

    mkdirSync(dirname(this.config.serialLog), { recursive: true });
    const accelArgs =
      (this.config.useKvm ?? true) && existsSync("/dev/kvm")
        ? ["-accel", "kvm"]
        : ["-accel", "tcg"];

    const args = [
      ...accelArgs,
      "-m",
      String(this.config.memoryMiB ?? 2048),
      "-smp",
      String(this.config.cpus ?? 2),
      "-snapshot", // disk writes go to a temp overlay; base qcow2 untouched
      "-drive",
      `file=${this.config.diskImage},if=virtio,format=qcow2`,
      "-drive",
      `file=${this.config.seedIso},if=virtio,format=raw,readonly=on`,
      "-nic",
      `user,model=virtio-net-pci,hostfwd=tcp:${this.config.bindAddr}:${this.config.sshPort}-:22`,
      "-display",
      "none",
      "-serial",
      `file:${this.config.serialLog}`,
      ...(this.config.extraQemuArgs ?? []),
    ];

    // Truncate the serial log so each run starts clean.
    closeSync(openSync(this.config.serialLog, "w"));

    this.proc = spawn(["qemu-system-x86_64", ...args], {
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
    });
  }

  async waitReady(opts: { timeoutMs?: number; onProgress?: (msg: string) => void } = {}): Promise<void> {
    if (!this.proc) throw new Error("VM not started");
    const t0 = Date.now();
    opts.onProgress?.("waiting for ssh to accept connections");
    await waitForSsh(this.sshTarget, {
      timeoutMs: opts.timeoutMs ?? 240_000,
      onTick: (elapsedMs) => {
        if (elapsedMs % 30_000 < 2_500) opts.onProgress?.(`ssh not ready yet (${Math.floor(elapsedMs / 1000)}s)`);
      },
    });
    opts.onProgress?.(`ssh ready after ${Math.floor((Date.now() - t0) / 1000)}s; waiting for cloud-init`);
    await waitForCloudInit(this.sshTarget, { timeoutMs: opts.timeoutMs ?? 300_000 });
    opts.onProgress?.(`cloud-init done after ${Math.floor((Date.now() - t0) / 1000)}s total`);
  }

  exec(command: string): Promise<ExecResult> {
    return ssh(this.sshTarget, command);
  }

  /** Try a graceful poweroff first, then SIGTERM the qemu process. */
  async stop(opts: { graceful?: boolean; timeoutMs?: number } = {}): Promise<void> {
    if (!this.proc) return;
    const graceful = opts.graceful ?? true;
    const timeoutMs = opts.timeoutMs ?? 15_000;

    if (graceful) {
      // Best-effort poweroff. If SSH is already gone the call returns nonzero
      // and we fall through to SIGTERM.
      await ssh(this.sshTarget, "sudo poweroff || sudo /sbin/poweroff || true");
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (this.proc.exitCode !== null) break;
        await Bun.sleep(500);
      }
    }

    if (this.proc.exitCode === null) {
      this.proc.kill();
      const start = Date.now();
      while (Date.now() - start < 5_000 && this.proc.exitCode === null) {
        await Bun.sleep(100);
      }
      if (this.proc.exitCode === null) this.proc.kill(9);
    }
    this.proc = null;
  }

  isRunning(): boolean {
    return this.proc !== null && this.proc.exitCode === null;
  }
}
