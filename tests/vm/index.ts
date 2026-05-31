#!/usr/bin/env bun
//! Hod VM test orchestrator.
//!
//! Boots the Alpine Hod VM (snapshot mode — base disk is never mutated),
//! deploys the requested profiles, runs declarative test suites, and emits
//! a JSON results artifact alongside human-readable output.
//!
//! Usage:
//!   bun run tests/vm/index.ts [options]
//!   scripts/hod-vm-test [options]
//!
//! Options (all also configurable via env, env wins over defaults but loses to flags):
//!   --profile <path>           Add a profile to deploy (repeatable). Default:
//!                              profiles/minimal-vm.ts plus profiles/minimal-vm-dev.ts.
//!   --suite <name>             Run only the given suite (repeatable). Default: all.
//!   --keep-running             Don't stop the VM after tests; useful for debugging.
//!   --reuse                    Don't boot a new VM if one is already on the SSH port.
//!   --skip-deploy              Skip profile deploy step (assumes the VM already has them).
//!   --results <path>           Write results.json here (default .hod-vm/alpine/results.json).
//!   --serial-log <path>        Override serial log path.
//!   --bind-addr <addr>         qemu hostfwd bind addr (default 10.10.0.6 / $HOD_VM_HOST).
//!   --ssh-port <port>          Forwarded SSH port (default 2222 / $HOD_VM_SSH_PORT).
//!   --memory <MiB>             Guest memory (default 2048 / $HOD_VM_MEMORY).
//!   --cpus <n>                 Guest vCPUs (default 2 / $HOD_VM_CPUS).
//!   -h, --help                 Show this help.

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, resolve } from "path";
import { QemuVm } from "./vm.ts";
import { ssh } from "./ssh.ts";
import { deployProfile } from "./deploy.ts";
import { Reporter, exitCodeFor } from "./results.ts";
import { runCase } from "./case.ts";
import type { TestSuite } from "./case.ts";
import { invariantsSuite } from "./cases/invariants.ts";
import { minimalVmSuite } from "./cases/minimal-vm.ts";
import { minimalVmDevSuite } from "./cases/minimal-vm-dev.ts";

interface Args {
  profiles: string[];
  suites: string[]; // empty = all
  keepRunning: boolean;
  reuse: boolean;
  skipDeploy: boolean;
  resultsPath: string;
  serialLog: string;
  bindAddr: string;
  sshPort: number;
  user: string;
  diskImage: string;
  seedIso: string;
  memoryMiB: number;
  cpus: number;
  help: boolean;
}

function envOr(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    profiles: [],
    suites: [],
    keepRunning: false,
    reuse: false,
    skipDeploy: false,
    resultsPath: envOr("HOD_VM_RESULTS", ".hod-vm/alpine/results.json"),
    serialLog: envOr("HOD_VM_SERIAL_LOG", ".hod-vm/alpine/serial.log"),
    bindAddr: envOr("HOD_VM_HOST", "10.10.0.6"),
    sshPort: parseInt(envOr("HOD_VM_SSH_PORT", "2222"), 10),
    user: envOr("HOD_VM_USER", "hod"),
    diskImage: envOr("HOD_VM_DISK", ".hod-vm/alpine/hod-alpine.qcow2"),
    seedIso: envOr("HOD_VM_SEED", ".hod-vm/alpine/seed.iso"),
    memoryMiB: parseInt(envOr("HOD_VM_MEMORY", "2048"), 10),
    cpus: parseInt(envOr("HOD_VM_CPUS", "2"), 10),
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "-h":
      case "--help":
        a.help = true;
        break;
      case "--profile":
        a.profiles.push(next());
        break;
      case "--suite":
        a.suites.push(next());
        break;
      case "--keep-running":
        a.keepRunning = true;
        break;
      case "--reuse":
        a.reuse = true;
        break;
      case "--skip-deploy":
        a.skipDeploy = true;
        break;
      case "--results":
        a.resultsPath = next();
        break;
      case "--serial-log":
        a.serialLog = next();
        break;
      case "--bind-addr":
        a.bindAddr = next();
        break;
      case "--ssh-port":
        a.sshPort = parseInt(next(), 10);
        break;
      case "--memory":
        a.memoryMiB = parseInt(next(), 10);
        break;
      case "--cpus":
        a.cpus = parseInt(next(), 10);
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (a.profiles.length === 0) {
    a.profiles = ["profiles/minimal-vm.ts", "profiles/minimal-vm-dev.ts"];
  }
  return a;
}

function printHelp() {
  // The /*! ... */ doc comment at the top has the same content; just
  // surface a short version here for `--help`.
  process.stdout.write(`hod-vm-test — orchestrate boot, deploy, and smoke tests for the Hod Alpine VM.

Usage: bun run tests/vm/index.ts [options]

Options:
  --profile <path>      Add a profile (repeatable). Defaults: minimal-vm.ts + minimal-vm-dev.ts.
  --suite <name>        Run only this suite (repeatable). Defaults: all.
  --keep-running        Skip VM teardown.
  --reuse               Reuse a VM that's already on the configured SSH port.
  --skip-deploy         Skip the deploy phase.
  --results <path>      JSON results artifact path (default .hod-vm/alpine/results.json).
  --serial-log <path>   Serial console log path.
  --bind-addr <addr>    qemu hostfwd bind addr (default 10.10.0.6).
  --ssh-port <port>     Forwarded SSH port (default 2222).
  --memory <MiB>        Guest memory (default 2048).
  --cpus <n>            Guest vCPUs (default 2).
  -h, --help            Show this help.

Environment overrides (lower precedence than flags):
  HOD_VM_HOST, HOD_VM_SSH_PORT, HOD_VM_USER, HOD_VM_DISK, HOD_VM_SEED,
  HOD_VM_MEMORY, HOD_VM_CPUS, HOD_VM_RESULTS, HOD_VM_SERIAL_LOG.
`);
}

function profileNameOf(profilePath: string): string {
  return profilePath.replace(/\\/g, "/").split("/").pop()!.replace(/\.ts$/, "");
}

const ALL_SUITES: TestSuite[] = [invariantsSuite, minimalVmSuite, minimalVmDevSuite];

async function isVmReachable(args: Args): Promise<boolean> {
  const r = await ssh(
    { host: args.bindAddr, port: args.sshPort, user: args.user },
    "true",
  );
  return r.ok;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return 0;
  }

  // Resolve serial log path relative to the working directory.
  args.serialLog = resolve(args.serialLog);
  args.resultsPath = resolve(args.resultsPath);
  mkdirSync(dirname(args.resultsPath), { recursive: true });

  const reporter = new Reporter();
  let vm: QemuVm | null = null;
  let bootedHere = false;

  try {
    process.stdout.write("=== boot ===\n");
    if (args.reuse && (await isVmReachable(args))) {
      process.stdout.write(`  reusing VM already reachable at ${args.bindAddr}:${args.sshPort}\n`);
      vm = new QemuVm({
        diskImage: args.diskImage,
        seedIso: args.seedIso,
        serialLog: args.serialLog,
        bindAddr: args.bindAddr,
        sshPort: args.sshPort,
        user: args.user,
        memoryMiB: args.memoryMiB,
        cpus: args.cpus,
      });
      reporter.recordPhase("boot", 0, true, "reused running VM");
    } else {
      if (!existsSync(args.diskImage) || !existsSync(args.seedIso)) {
        reporter.recordPhase("boot", 0, false, "missing disk or seed (run scripts/hod-vm-build-alpine)");
        const summary = reporter.summarize();
        writeFileSync(args.resultsPath, JSON.stringify(summary, null, 2));
        return 1;
      }
      const t0 = Date.now();
      vm = new QemuVm({
        diskImage: args.diskImage,
        seedIso: args.seedIso,
        serialLog: args.serialLog,
        bindAddr: args.bindAddr,
        sshPort: args.sshPort,
        user: args.user,
        memoryMiB: args.memoryMiB,
        cpus: args.cpus,
      });
      await vm.start();
      bootedHere = true;
      process.stdout.write(`  qemu started; serial log: ${args.serialLog}\n`);
      try {
        await vm.waitReady({
          timeoutMs: 5 * 60_000,
          onProgress: (msg) => process.stdout.write(`  ${msg}\n`),
        });
        reporter.recordPhase("boot", Date.now() - t0, true);
      } catch (err) {
        reporter.recordPhase(
          "boot",
          Date.now() - t0,
          false,
          err instanceof Error ? err.message : String(err),
        );
        const summary = reporter.summarize();
        writeFileSync(args.resultsPath, JSON.stringify(summary, null, 2));
        return 1;
      }
    }

    // Deploy each profile in order.
    const deployedProfiles = new Set<string>();
    if (!args.skipDeploy) {
      process.stdout.write("\n=== deploy ===\n");
      for (const profilePath of args.profiles) {
        const t0 = Date.now();
        const name = profileNameOf(profilePath);
        process.stdout.write(`  deploying ${profilePath}...\n`);
        const r = await deployProfile({
          profilePath,
          env: {
            HOD_VM_HOST: args.bindAddr,
            HOD_VM_SSH_PORT: String(args.sshPort),
            HOD_VM_USER: args.user,
          },
        });
        if (!r.ok) {
          reporter.recordPhase(`deploy ${name}`, Date.now() - t0, false, `exit ${r.exitCode}`);
          // Surface the last few lines of the deploy log to make debugging easier.
          const tail = r.log.split("\n").slice(-20).join("\n");
          process.stdout.write(`    deploy log tail:\n${tail}\n`);
        } else {
          reporter.recordPhase(`deploy ${name}`, Date.now() - t0, true);
          deployedProfiles.add(name);
        }
      }
    } else {
      // Mark as "deployed" for suite gating purposes.
      for (const profilePath of args.profiles) deployedProfiles.add(profileNameOf(profilePath));
    }

    // Pick suites to run.
    const wanted = args.suites.length > 0 ? new Set(args.suites) : null;
    const suites = ALL_SUITES.filter((s) => (wanted ? wanted.has(s.name) : true));

    for (const suite of suites) {
      reporter.groupHeader(suite.name);
      if (suite.requiresProfile && !deployedProfiles.has(suite.requiresProfile)) {
        for (const c of suite.cases) {
          reporter.recordCase({
            name: c.name,
            group: suite.name,
            status: "skip",
            durationMs: 0,
            message: `requires profile ${suite.requiresProfile} (not deployed)`,
          });
        }
        continue;
      }
      for (const c of suite.cases) {
        const result = await runCase(c, { vm, group: suite.name });
        reporter.recordCase(result);
      }
    }

    const summary = reporter.summarize();
    writeFileSync(args.resultsPath, JSON.stringify(summary, null, 2));
    process.stdout.write(
      `\n=== results: ${summary.pass} passed, ${summary.fail} failed, ${summary.skip} skipped, ${summary.error} errored (${(summary.durationMs / 1000).toFixed(1)}s) ===\n`,
    );
    process.stdout.write(`  artifacts: ${args.resultsPath}\n`);
    process.stdout.write(`             ${args.serialLog}\n`);
    return exitCodeFor(summary);
  } finally {
    if (vm && bootedHere && !args.keepRunning) {
      process.stdout.write("\n=== teardown ===\n");
      await vm.stop({ graceful: true });
      process.stdout.write("  vm stopped\n");
    } else if (vm && args.keepRunning) {
      process.stdout.write("\n=== teardown (skipped --keep-running) ===\n");
      process.stdout.write(`  ssh -p ${args.sshPort} ${args.user}@${args.bindAddr}\n`);
    }
  }
}

const exitCode = await main();
process.exit(exitCode);
