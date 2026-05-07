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
- [ ] 11. **openssh** — openssl + zlib done. Essential for remote access and file transfer (scp/sftp). Moderate complexity (needs libcrypto, maybe a few tweaks).
- [ ] 12. **vim** — Needs ncurses (done). Could also link against perl once that's in the build graph. The most important editor for most devs.
- [ ] 13. **procps-ng** — Provides `ps`, `top`, `free`, `kill`, `pgrep`, `uptime`, `w`, `watch`, etc. Needs ncurses (done). These are fundamental system management tools.
- [ ] 14. **htop** — Needs ncurses (done). Much nicer than top for interactive monitoring.
- [ ] 15. **strace** — Almost standalone (no special deps). Incredibly useful for debugging builds, sandbox issues, and runtime problems. Should be straightforward.
- [ ] 16. **nano** — Needs ncurses (done). Simple, approachable editor. Good to have alongside vim.
- [ ] 17. **rsync** — Needs openssl + zlib (done). File sync/backup workhorse.
- [ ] 18. **oniguruma + jq** — Oniguruma is a small regex library; jq depends on it. JSON processing is essential for any modern workflow. Two small packages.
- [ ] 19. **tree** — Not in `/run/current-system/sw/bin` but trivially easy to build (single C file) and genuinely useful every day. Great "warm-up" package.
- [ ] 20. **python** — All deps are built (openssl, zlib, libffi, ncurses, readline, bzip2, xz). The capstone validation prize. Complex build but enormous payoff — pip ecosystem awaits.


