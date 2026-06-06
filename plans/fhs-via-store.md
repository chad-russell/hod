# FHS-via-Store: NixOS-like System with FHS Compliance

**Status:** Active planning (baby steps)

## Goal

Replace Arch rootfs binaries with Hod store packages while maintaining
standard FHS layout (`/bin/bash`, `/usr/lib/libc.so.6`, etc.). The result
should be indistinguishable from a regular Linux system to arbitrary binaries,
but with full content-addressed reproducibility and declarative management.

## Current state

```
/usr/bin/          961 binaries (all from Arch pacman)
/usr/lib/          626 shared libraries (all from Arch)
/usr/hod/store/    27 packages (desktop apps only)
/bin -> /usr/bin   (Arch symlink)
```

Arch rootfs is built once by pacstrap and treated as immutable afterward.
Hod adds desktop apps on top via the profile's PATH injection.

## Architecture

### Phase 1: FHS symlink farm (proof of concept)

Build core packages in Hod and create symlinks from FHS paths to the store.

```
/usr/bin/bash  -> /usr/hod/store/staging/XX/.../bin/bash
/usr/bin/ls    -> /usr/hod/store/staging/YY/.../bin/ls
/usr/lib/libc.so.6 -> /usr/hod/store/staging/ZZ/.../lib/libc.so.6
```

A "system-core" profile provides the base FHS layer. The image builder
creates symlinks during image generation (no changes to the running system).

**First packages to build (well-understood, self-contained):**
- bash
- coreutils (ls, cp, mv, rm, cat, etc.)
- findutils
- gawk
- grep
- sed
- gzip, bzip2, xz, zstd

**Mechanism:** `hod-arch-build` gets a new step after profile staging:
1. Resolve all binaries/libs from the system-core profile
2. Create symlinks in the rootfs, shadowing the Arch originals
3. Optionally remove the Arch originals to verify no hidden deps

### Phase 2: Shared library layer

Build glibc, ncurses, readline, etc. in Hod and provide via `/usr/lib/` symlinks.

This is the critical enabler — once glibc comes from Hod:
- All Hod-built binaries use the same libc
- The Arch rootfs libc becomes redundant
- Arbitrary binary compatibility is maintained (FHS paths still work)

**Challenge:** glibc is deeply intertwined with the dynamic linker
(`/lib64/ld-linux-x86-64.so.2`). The image must provide this path.

### Phase 3: System services

Build systemd, dbus, openssh, seatd from source in Hod.

**This is the hardest phase** because:
- systemd has deep integration with the init system, journald, logind
- D-Bus system bus activation expects specific paths
- systemd units reference binaries by absolute path

**Strategy:** Build systemd units that reference store paths, then symlink
the units into `/usr/lib/systemd/system/`.

### Phase 4: Minimal seed rootfs

Eventually the Arch rootfs shrinks to just:
- Linux kernel + modules (already from Arch, could move to Hod)
- Bootloader (GRUB, already EFI)
- `/usr/hod/` store and system generation
- FHS symlink farm pointing to store
- A few boot-critical paths (`/sbin/init -> store`, `/lib64/ld-*.so.2`)

At this point the rootfs is a thin ~50MB skeleton and all content comes
from Hod recipes.

## Baby step: what to do now

1. **Build bash in Hod** — already partially done (bash is a dependency of
   many packages). Add a dedicated `recipes/native/bash/` recipe.

2. **Build coreutils in Hod** — `ls`, `cp`, `rm`, etc. Uses standard
   autotools, straightforward to build.

3. **Add a "system-core" profile** with bash + coreutils + grep + sed + gawk.

4. **Extend `hod-arch-build`** with an FHS symlink generation step:
   - For each package in the system-core profile
   - For each binary in `pkg/bin/`
   - Create `/usr/bin/<name> -> <store_path>/bin/<name>`
   - For each lib in `pkg/lib/`
   - Create `/usr/lib/<name> -> <store_path>/lib/<name>`

5. **Verify** — boot the VM, check that `bash --version` reports the
   Hod-built version, that `ls` works, etc.

## Design decisions

- **Symlinks, not bind mounts or hardlinks.** Symlinks are transparent,
  debuggable, and work across filesystems.

- **FHS paths are sacred.** No `/usr/hod/bin/` in PATH for system tools.
  `/usr/bin/bash` must resolve to a real bash.

- **No mixed libc.** Phase 2 (glibc from Hod) must land before we replace
  Arch's shared libraries. Mixing Arch's libc with Hod-built binaries that
  depend on Hod's libc would be fragile.

- **Shadow, don't delete (at first).** During Phase 1, the original Arch
  binary remains on disk but is shadowed by the symlink. This allows easy
  rollback.

- **Profile-driven.** The set of FHS symlinks is derived from a Hod profile,
  so it's declarative and reproducible.

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Arch binary depends on Arch-specific paths | Build same version in Hod, verify feature parity |
| glibc ABI mismatch between phases | Don't touch shared libs until Phase 2 |
| systemd path assumptions | Test thoroughly in VM before removing Arch copies |
| Build deps explosion (bash needs readline needs ncurses needs glibc) | This is expected — Hod already handles transitive deps |
