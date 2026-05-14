//! Hermetic preamble generator for Process build scripts.
//!
//! Generates a shell snippet that sets up the in-sandbox filesystem
//! so that configure scripts and dynamically-linked binaries can run.
//! Every symlink points into `/deps/<name>/`, so nothing escapes the
//! declared dependency set.

export interface HermeticPreambleOptions {
  /** Dep name providing `bin/busybox`. Creates `/bin/sh` and supplies setup applets. */
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

  /**
   * Dep name providing the shims bundle (bison, m4, make, etc.).
   * Sets up /share/bison symlink so bison can find its data files.
   */
  shims?: string;

  /**
   * Dep name providing Python 3 (`bin/python3`). When set, creates:
   *
   * - `/usr/bin/env` → busybox (so `#!/usr/bin/env python3` shebangs work)
   * - `/usr/bin/python3` → shell wrapper that exec's `/deps/<python>/bin/python3`
   *
   * This is necessary because when the kernel processes a shebang script,
   * it sets AT_EXECFN to the *script* path, not the interpreter. The Python
   * binary's AT_EXECFN bootstrap then computes the wrong ld-linux path when
   * the script is more than 2 directories deep. The wrapper avoids this by
   * ensuring AT_EXECFN is always `/usr/bin/python3` (which is shallow enough
   * for the relative path to resolve correctly).
   *
   * **Do not** sed-change shebangs to `#!/deps/python/bin/python3` — that
   * triggers the same AT_EXECFN bug for scripts deeper than 2 levels.
   */
  python?: string;
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
  const lnCmd = opts.shell ? '"$HOD_SHELL_BUSYBOX" ln' : "ln";
  const mkdirCmd = opts.shell ? '"$HOD_SHELL_BUSYBOX" mkdir' : "mkdir";
  const cpCmd = opts.shell ? '"$HOD_SHELL_BUSYBOX" cp' : "cp";

  // Ensure shell dep tools take precedence over glibc-linked tools from other
  // deps, and use busybox applets explicitly for the preamble itself. This
  // avoids depending on dynamically-linked ln/mkdir/cp before the runtime
  // linker is set up.
  if (opts.shell) {
    lines.push(`export PATH="/deps/${opts.shell}/bin:$PATH"`);
    lines.push(`export HOD_SHELL_BUSYBOX="/deps/${opts.shell}/bin/busybox"`);
    lines.push(`${lnCmd} -sf /deps/${opts.shell}/bin/busybox /bin/sh || true`);
  }

  // --- Python wrapper setup ---
  //
  // When the kernel processes a shebang like `#!/usr/bin/env python3`,
  // AT_EXECFN is set to the script path (not the interpreter). Python's
  // AT_EXECFN bootstrap computes dirname(AT_EXECFN) + rel_path to find
  // ld-linux. If the script is deeper than 2 directory levels, this
  // resolves incorrectly. The wrapper at /usr/bin/python3 (only 2 levels
  // deep) ensures the bootstrap always works.
  if (opts.python) {
    const busyboxBin = `"$HOD_SHELL_BUSYBOX"`;
    lines.push(``);
    lines.push(`# Python: /usr/bin/env + /usr/bin/python3 wrapper for correct AT_EXECFN bootstrap`);
    lines.push(`${mkdirCmd} -p /usr/bin`);
    if (!opts.shell) {
      throw new Error("hermeticPreamble: 'python' requires 'shell' (busybox provides /usr/bin/env)");
    }
    lines.push(`${lnCmd} -sf /deps/${opts.shell}/bin/busybox /usr/bin/env`);
    lines.push(`printf '#!/bin/sh\\nexec /deps/${opts.python}/bin/python3 "$@"\\n' > /usr/bin/python3`);
    lines.push(`${busyboxBin} chmod +x /usr/bin/python3`);
  }

  // --- Dynamic linker + runtime library setup ---
  //
  // ORDER MATTERS. We set up glibc FIRST, then musl. Both C libraries
  // have a file named "libc.so" but with different contents:
  //   glibc: libc.so  → linker script (text, references /lib/libc.so.6)
  //   musl:  libc.so  → ELF binary (the actual musl libc)
  //
  // The musl dynamic linker chain requires /lib/libc.so to be the ELF
  // binary, so musl must "win" the /lib/libc.so symlink. By doing glibc
  // first, the glibc libc.so (linker script) lands in /lib/, then musl's
  // ln -sf overwrites it with the correct ELF binary.
  if (opts.glibcLinker) {
    lines.push(`${lnCmd} -sf /deps/${opts.glibcLinker}/lib/ld-linux-x86-64.so.2 /lib/ld-linux-x86-64.so.2 || true`);
    lines.push(`${lnCmd} -sf /deps/${opts.glibcLinker}/lib/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2 || true`);
    lines.push(`# Glibc runtime: shared objects, crt*.o, and static libs`);
    lines.push(`for lib in /deps/${opts.glibcLinker}/lib/*; do`);
    lines.push(`  name="\${lib##*/}"`);
    lines.push(`  ${lnCmd} -sf "$lib" "/lib/$name" 2>/dev/null || true`);
    lines.push(`done`);
  }

  // musl dynamic linker — must come AFTER glibc so /lib/libc.so is the
  // musl ELF binary (not the glibc linker script).
  if (opts.muslLinker) {
    lines.push(`${lnCmd} -sf /deps/${opts.muslLinker}/lib/libc.so /lib/libc.so || true`);
    lines.push(`${lnCmd} -sf /deps/${opts.muslLinker}/lib/ld-musl-x86_64.so.1 /lib/ld-musl-x86_64.so.1 || true`);
  }

  // Shims bundle — bison data directory + PATH + m4 symlink
  if (opts.shims) {
    lines.push(`${mkdirCmd} -p /share /bin`);
    lines.push(`${lnCmd} -sf /deps/${opts.shims}/share/bison /share/bison`);
    // Bison built in a sandbox with m4 at /deps/m4/bin/m4 hardcodes that path.
    // Create the expected directory structure so bison can find m4.
    lines.push(`${mkdirCmd} -p /deps/m4/bin`);
    lines.push(`${lnCmd} -sf /deps/${opts.shims}/bin/m4 /deps/m4/bin/m4`);
    // Add shims bin to PATH so tools can find make, sed, etc.
    lines.push(`export PATH="/deps/${opts.shims}/bin:$PATH"`);
  }

  // Sysroot — merged glibc + linux-headers at /tmp/sysroot
  if (opts.sysroot) {
    const { glibc, linuxHeaders } = opts.sysroot;
    lines.push(...[
      `${mkdirCmd} -p /tmp/sysroot/include /tmp/sysroot/lib /tmp/sysroot/lib64 /tmp/sysroot/usr`,
      `${cpCmd} -a /deps/${glibc}/include/. /tmp/sysroot/include/`,
      `${cpCmd} -a /deps/${linuxHeaders}/include/. /tmp/sysroot/include/`,
      `${cpCmd} -a /deps/${glibc}/lib/. /tmp/sysroot/lib/`,
      `${lnCmd} -sf ../include /tmp/sysroot/usr/include`,
      `${lnCmd} -sf ../lib /tmp/sysroot/usr/lib`,
      `${lnCmd} -sf ../lib64 /tmp/sysroot/usr/lib64`,
      `${lnCmd} -sf ../lib/ld-linux-x86-64.so.2 /tmp/sysroot/lib64/ld-linux-x86-64.so.2 || true`,
    ]);
  }

  return lines.join("\n");
}
