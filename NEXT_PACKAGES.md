# Next Packages

Already built: bash, binutils, coreutils, diffutils, findutils, gawk, grep, make, patch, sed, tar, cbonsai, ncurses, zlib, openssl, bzip2, xz, readline, libffi, pkgconf, perl, curl, ca-certificates, gzip, less, m4, expat, file, zstd, libiconv.

Prioritized by (feasibility with current deps) × (usefulness to you).

## Shared-library migration tasks

Before pushing too far up the stack, migrate foundational static-only libraries to shared-library outputs where that clearly helps downstream consumers. Prefer store-relative shared linking (`runtime_deps` + relocation) over static bundling when upstream supports it cleanly.

- [x] S1. **zlib + bzip2 + xz + zstd** — Rebuilt the core compression libraries with shared-library outputs (`libz.so*`, `libbz2.so*`, `liblzma.so*`, `libzstd.so*`) and kept CLI tools working. These are ubiquitous leaf dependencies and many future packages will expect shared linking by default.
- [x] S2. **expat + libiconv + libffi** — Rebuilt these foundational general-purpose libraries with shared outputs. They are common downstream deps for git, python, scripting runtimes, and desktop-stack packages.
- [x] S3. **ncurses + readline** — Rebuild terminal/line-editing libraries with shared outputs. This will make shells, editors, and TUIs look more like normal distro packages and reduce duplication in downstream closures.
- [x] S4. **openssl + curl + file(libmagic)** — Migrated higher-level libraries/tooling to shared outputs. Shared `libcrypto`, `libssl`, `libcurl`, and `libmagic` now available for downstream packages via pkg-config and store-relative RUNPATH. Also fixed self-referencing `$ORIGIN/../lib` RUNPATH for packages that produce both executables and shared libs, and increased DUMMY_RUNPATH to handle 6+ runtime deps.
- [x] S5. **Policy pass: static vs shared defaults** — All library recipes now build shared outputs. Agent guidance (`docs/agent-package-guide.md`) updated with a comprehensive static-vs-shared policy section, decision criteria, and a reference table mapping every existing package to its linking category. Bootstrap/toolchain packages are correctly static; all `shellBuild` libraries produce `.so` outputs with `runtime_deps` and store-relative RUNPATH.

- [x] 1. **curl** — openssl + zlib done. Essential for downloading. Also unblocks git and makes `download()` potentially self-contained. Moderate effort (autotools build).
- [x] 2. **ca-certificates** — Data-only package (Mozilla CA bundle). Without this, curl/git HTTPS is broken. Very easy; mostly a Download + Unpack of the cert bundle + wiring `SSL_CERT_FILE`.
- [x] 3. **gzip** — Zero new dependencies. Trivial autotools build. Core compression tool; the fact we don't have it yet is a gap (we have bzip2 and xz but not gzip!).
- [x] 4. **less** — Only needs ncurses (done). The standard Unix pager. Simple build, high everyday value.
- [x] 5. **m4** — Standalone, no deps beyond toolchain. Build infrastructure that unblocks autoconf/automake later. Very small, builds in seconds.
- [x] 6. **expat** — Small C XML parser (~50K LOC). Standalone build. Needed by git (for HTTP), dbus, fontconfig, and many others.
- [x] 7. **file** (libmagic) — Needs zlib + bzip2 + xz, all done. Both a useful utility (`file` command) and a library other packages link against. Standard autotools build.
- [x] 8. **zstd** — Modern compression standard. Can build with just zlib + xz (lz4 optional). Increasingly required by package managers and kernel tools.
- [x] 9. **libiconv** — Character encoding conversion. Needed by git, bash builds sometimes, and many GNU packages. Small library, straightforward build.
- [x] 10. **git** — Built git 2.54.0 with HTTP/HTTPS support via shared curl, openssl, zlib, expat, and libiconv. Makefile-based build using config.mak for build configuration. All runtime deps correctly relocated via store-relative RPATH.
- [x] 11. **openssh** — OpenSSH 10.3p1. Built with shared openssl + zlib. Standard autotools build. All binaries (ssh, scp, sftp, sshd, ssh-agent, ssh-add, ssh-keygen, ssh-keyscan + libexec helpers) working with store-relative RPATH.
- [x] 12. **vim** — Vim 9.2 with huge features, built with shared ncurses. Dynamically links libncursesw + glibc via store-relative RPATH. Produces vim, vi, xxd, vimtutor symlinks. Had to force cross-compilation mode (sed-patch) to skip AC_TRY_RUN tests that can't execute in the hermetic sandbox.
- [x] 13. **procps-ng** — procps-ng 4.0.6 with shared libproc2 + ncurses. Provides ps, top, free, kill, pgrep, pkill, pidof, pidwait, pmap, pwdx, slabtop, hugetop, sysctl, tload, uptime, vmstat, w, watch. Store-relative RPATH relocation working.
- [x] 14. **htop** — htop 3.5.1 with shared ncursesw (unicode). Interactive process viewer. Store-relative RPATH to ncurses and toolchain.
- [x] 15. **strace** — Almost standalone (no special deps). Incredibly useful for debugging builds, sandbox issues, and runtime problems. Should be straightforward.
- [x] 16. **nano** — Needs ncurses (done). Simple, approachable editor. Good to have alongside vim.
- [x] 17. **rsync** — rsync 3.3.0 built with shared openssl, zlib, zstd. File sync/backup workhorse. Required autoconf cache workaround for hermetic sandbox (configure.sh can't run test programs to determine type sizes).
- [x] 18. **oniguruma + jq** — jq 1.8.1 built with its bundled oniguruma 6.9.x. Produces jq CLI, libjq.so, libonig.so, plus headers and pkg-config files for both libraries. Required autoconf cache workaround for hermetic sandbox. Standalone oniguruma source tarball lacks pre-generated configure (needs autoreconf); jq's bundled copy works fine.
- [x] 19. **tree** — tree 2.3.2. Simple Makefile build, zero deps beyond toolchain. Produces a single `bin/tree` binary dynamically linked to glibc via store-relative RPATH.
- [x] 20. **python** — Python 3.13.13 with shared libpython, 58 extension modules including _ssl, _hashlib, zlib, _ctypes, _curses, _curses_panel, readline, _bz2, _lzma, pyexpat, _elementtree, _decimal (bundled mpdecimal). Fixed ncurses pkg-config (added --enable-pc-files) and bypassed pkg-config sandbox path issues by pre-setting _CFLAGS/_LIBS variables. Store-relative RPATH working for all binaries and extension modules.


