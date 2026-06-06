//! System configuration types for `hod system build`.
//!
//! A system config defines the full declarative state of a Hod-managed machine:
//! packages, users, services, networking, etc.

import { encodeJson } from "./cli.js";
import type { BuiltRecipe } from "./file.js";

export interface SystemUser {
  name: string;
  uid: number;
  groups: string[];
  home?: string;
  shell?: string;
}

export interface SystemGroup {
  name: string;
  gid: number;
}

export interface SystemConfig {
  hostname: string;
  timezone?: string;
  locale?: string;
  kernel?: string;
  packages: BuiltRecipe[];
  users: SystemUser[];
  groups: SystemGroup[];
  services: {
    enable: string[];
    disable?: string[];
  };
  boot?: {
    kernelArgs?: string[];
  };
}

export interface SystemDefinition {
  config: SystemConfig;
}

export function defineSystem(config: SystemConfig): SystemDefinition {
  return { config };
}

export async function buildSystemOutput(def: SystemDefinition): Promise<Uint8Array> {
  const json = {
    type: "system" as const,
    config: {
      hostname: def.config.hostname,
      timezone: def.config.timezone ?? "UTC",
      locale: def.config.locale ?? "en_US.UTF-8",
      kernel: def.config.kernel ?? "arch",
      packages: def.config.packages.map((p) => p.hash),
      users: def.config.users,
      groups: def.config.groups,
      services: def.config.services,
      boot: def.config.boot ?? {},
    },
  };
  return encodeJson(json);
}
