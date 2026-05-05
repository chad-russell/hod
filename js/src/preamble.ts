//! Hermetic preamble generator for Process build scripts.
//!
//! Generates a shell snippet that sets up the in-sandbox filesystem
//! so that configure scripts and dynamically-linked binaries can run.
//! Every symlink points into `/deps/<name>/`, so nothing escapes the
//! declared dependency set.

export interface HermeticPreambleOptions {
  /** Dep name providing `bin/busybox` (or `bin/sh`). Creates `/bin/sh`. */
  shell?: string;

  /** Dep name providing the musl dynamic linker at `lib/ld-musl-x86_64.so.1`. */
  muslLinker?: string;

  /** Dep name providing the glibc dynamic linker at `lib/ld-linux-x86-64.so.2`. */
  glibcLinker?: string;

  /**
   * Build a glibc sysroot at `/tmp/sysroot` from the named deps.
   *
   * ```ts
   * sysroot: { glibc: "glibc", linuxHeaders: "linux-headers" }
   * ```
   */
  sysroot?: { glibc: string; linuxHeaders: string };
}

/**
 * Generate a hermetic sandbox preamble shell snippet.
 *
 * Insert this at the top of your build script (after `set -e`).
 * Each option is opt-in — only the symlinks you ask for are created.
 *
 * ```ts
 * const preamble = hermeticPreamble({
 *   shell: "seed",
 *   muslLinker: "seed",
 *   glibcLinker: "glibc",
 *   sysroot: { glibc: "glibc", linuxHeaders: "linux-headers" },
 * });
 * ```
 *
 * All paths resolve within the sandbox's chroot. Nothing leaks to the host.
 */
export function hermeticPreamble(opts: HermeticPreambleOptions = {}): string {
  const lines: string[] = [];

  // `/bin/sh` — needed for configure script shebangs (`#!/bin/sh`)
  if (opts.shell) {
    lines.push(`ln -sf /deps/${opts.shell}/bin/busybox /bin/sh || true`);
  }

  // musl dynamic linker — needed to run musl-linked binaries (seed tools, gcc-stage1)
  if (opts.muslLinker) {
    lines.push(`ln -sf /deps/${opts.muslLinker}/lib/ld-musl-x86_64.so.1 /lib/ld-musl-x86_64.so.1 || true`);
  }

  // glibc dynamic linker — needed to run/link glibc binaries
  if (opts.glibcLinker) {
    lines.push(`ln -sf /deps/${opts.glibcLinker}/lib/ld-linux-x86-64.so.2 /lib/ld-linux-x86-64.so.2 || true`);
    lines.push(`ln -sf /deps/${opts.glibcLinker}/lib/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2 || true`);
  }

  // Sysroot — merged glibc + linux-headers at /tmp/sysroot
  if (opts.sysroot) {
    const { glibc, linuxHeaders } = opts.sysroot;
    lines.push(...[
      `mkdir -p /tmp/sysroot/include /tmp/sysroot/lib /tmp/sysroot/lib64 /tmp/sysroot/usr`,
      `cp -a /deps/${glibc}/include/. /tmp/sysroot/include/`,
      `cp -a /deps/${linuxHeaders}/include/. /tmp/sysroot/include/`,
      `cp -a /deps/${glibc}/lib/. /tmp/sysroot/lib/`,
      `ln -sf ../include /tmp/sysroot/usr/include`,
      `ln -sf ../lib /tmp/sysroot/usr/lib`,
      `ln -sf ../lib64 /tmp/sysroot/usr/lib64`,
      `ln -sf ../lib/ld-linux-x86-64.so.2 /tmp/sysroot/lib64/ld-linux-x86-64.so.2 || true`,
    ]);
  }

  return lines.join("\n");
}
