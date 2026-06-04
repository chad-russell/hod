//! Build environment helpers.
//!
//! Provides helpers for constructing build environment variables from
//! dependency lists. Used by Rust/C interop recipes and other builds
//! that need to compose C library search paths.

import { depSubpath, pathList } from "../../js/src/index.js";

/**
 * Return environment variables for TLS certificate verification.
 *
 * Sets both CARGO_HTTP_CAINFO and SSL_CERT_FILE so that any tool
 * (cargo, curl, pip, etc.) can verify HTTPS connections.
 *
 * Usage:
 *   import { caCertEnv } from "../../helpers/net.js";
 *   cargoBuild({ env: caCertEnv(), ... });
 */
export function caCertEnv(caDepName: string = "ca-certs"): Record<string, string> {
  const certPath = depSubpath(caDepName, "etc/ssl/certs/ca-certificates.crt");
  return {
    CARGO_HTTP_CAINFO: certPath,
    SSL_CERT_FILE: certPath,
  };
}

export interface DepEnvEntry {
  /** Dependency name as mounted in sandbox (e.g., "freetype"). */
  name: string;
  /**
   * Extra include subpaths beyond the default "include".
   * Use this for deps that install headers under versioned or
   * nested directories, e.g., ["include/freetype2"].
   * The default "include" is always included.
   */
  extraIncludes?: string[];
  /**
   * Extra library subpaths beyond the default "lib".
   * Use this for deps that install libraries under nested
   * directories, e.g., ["lib/pulseaudio"].
   */
  extraLibs?: string[];
}

type DepEnvInput = string | DepEnvEntry;

function toEntry(d: DepEnvInput): DepEnvEntry {
  return typeof d === "string" ? { name: d } : d;
}

/**
 * Return environment variables for builds that link against C libraries.
 *
 * Computes PKG_CONFIG_PATH, C_INCLUDE_PATH, LIBRARY_PATH, and LD_LIBRARY_PATH
 * from dependency entries. Each entry can be a simple string (dep name) or an
 * object with extra include/lib subpaths.
 *
 * Usage (simple — standard paths only):
 *   depEnvFromList(["wayland", "libxkbcommon", "libdrm"])
 *
 * Usage (with custom include paths):
 *   depEnvFromList([
 *     "wayland",
 *     "libxkbcommon",
 *     { name: "freetype", extraIncludes: ["include/freetype2"] },
 *     { name: "glib", extraIncludes: ["include/glib-2.0", "lib/glib-2.0/include"] },
 *   ])
 */
export function depEnvFromList(deps: readonly DepEnvInput[]): Record<string, string> {
  const entries = deps.map(toEntry);
  const env: Record<string, string> = {};

  const pkgConfigPath = pathList(
    entries.flatMap((e) => [depSubpath(e.name, "lib/pkgconfig"), depSubpath(e.name, "share/pkgconfig")]),
  );
  if (pkgConfigPath) env.PKG_CONFIG_PATH = pkgConfigPath;

  const includePath = pathList(
    entries.flatMap((e) => [
      depSubpath(e.name, "include"),
      ...(e.extraIncludes ?? []).map((p) => depSubpath(e.name, p)),
    ]),
  );
  if (includePath) env.C_INCLUDE_PATH = includePath;

  const libPath = pathList(
    entries.flatMap((e) => [
      depSubpath(e.name, "lib"),
      ...(e.extraLibs ?? []).map((p) => depSubpath(e.name, p)),
    ]),
  );
  if (libPath) {
    env.LIBRARY_PATH = libPath;
    env.LD_LIBRARY_PATH = libPath;
  }

  return env;
}
