type SystemdScalar = string | number | boolean;
type SystemdScalarList = readonly SystemdScalar[];
type SystemdMappingValue = SystemdScalar | SystemdScalarList;

export type SystemdValue =
  | SystemdScalar
  | SystemdScalarList
  | Record<string, SystemdMappingValue>
  | undefined;

export type SystemdSection = Record<string, SystemdValue>;

export interface SystemdUnitConfig {
  Unit?: SystemdSection;
  Service?: SystemdSection;
  Install?: SystemdSection;
  Timer?: SystemdSection;
  Socket?: SystemdSection;
  Target?: SystemdSection;
  Path?: SystemdSection;
}

export interface UserUnitDefinition {
  name: string;
  content: string;
  enable: boolean;
}

function scalarToString(value: SystemdScalar): string {
  return typeof value === "boolean" ? (value ? "true" : "false") : String(value);
}

function appendLines(lines: string[], key: string, value: Exclude<SystemdValue, undefined>): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      lines.push(`${key}=${scalarToString(entry)}`);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const [subkey, subvalue] of Object.entries(value)) {
      if (Array.isArray(subvalue)) {
        for (const entry of subvalue) {
          lines.push(`${key}=${subkey}=${scalarToString(entry)}`);
        }
      } else {
        lines.push(`${key}=${subkey}=${scalarToString(subvalue)}`);
      }
    }
    return;
  }

  lines.push(`${key}=${scalarToString(value)}`);
}

export function unitToIni(config: SystemdUnitConfig): string {
  const sections: [string, SystemdSection | undefined][] = [
    ["Unit", config.Unit],
    ["Service", config.Service],
    ["Install", config.Install],
    ["Timer", config.Timer],
    ["Socket", config.Socket],
    ["Target", config.Target],
    ["Path", config.Path],
  ];

  const parts: string[] = [];
  for (const [sectionName, section] of sections) {
    if (!section) continue;
    const entries = Object.entries(section).filter(([, value]) => value !== undefined);
    if (entries.length === 0) continue;

    const lines = [`[${sectionName}]`];
    for (const [key, value] of entries) {
      appendLines(lines, key, value as Exclude<SystemdValue, undefined>);
    }
    parts.push(lines.join("\n"));
  }

  return `${parts.join("\n\n")}\n`;
}

export function userUnit(name: string, config: SystemdUnitConfig): UserUnitDefinition {
  const unitName = name.includes(".") ? name : `${name}.service`;
  const enable = config.Install !== undefined && Object.keys(config.Install).length > 0;
  return {
    name: unitName,
    content: unitToIni(config),
    enable,
  };
}
