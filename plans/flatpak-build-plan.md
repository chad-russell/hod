# Flatpak Build Plan

**Status:** Done — all 4 phases complete, flatpak 1.16.6 builds and runs from source

Build flatpak and its full dependency tree from source for Hod.

## Summary

Flatpak 1.16.6 needs 7 new packages (fuse3, bubblewrap, xdg-dbus-proxy, libgpg-error, gpgme, e2fsprogs-libs, ostree) plus the flatpak recipe itself. All other dependencies (glib, curl, libarchive, json-glib, appstream, gdk-pixbuf, libseccomp, libcap, zstd, xz, util-linux, libxml2, libportal, libsoup3, openssl, wayland) already exist in Hod.

## New packages needed

| Package | Version | Build system | Complexity | Deps | Notes |
|---------|---------|-------------|------------|------|-------|
| fuse3 | 3.17.x | meson | Simple | — | Small, ~20 C files |
| bubblewrap | 0.12.0 | meson | Simple | libcap | 4 C files. Immediately useful standalone |
| xdg-dbus-proxy | 0.1.7 | meson | Simple | glib/gio | 2 C files |
| libgpg-error | 1.51 | autotools | Simple | — | Prereq for gpgme |
| gpgme | 1.24.x | autotools | Medium | libgpg-error | GPG bindings. Needs `gpg` at build time? Check |
| e2fsprogs-libs | 1.47.x | autotools | Medium | — | Only need `e2p` lib, not full e2fsprogs |
| ostree | 2025.2 | autotools | **Hard** | glib, curl, xz, zlib, e2p, libgpg-error, libarchive, libmount, fuse3 | The big one. Large codebase, git submodule (libglnx), many optional features |
| flatpak | 1.16.6 | meson | Hard | all above + json-glib, appstream, gdk-pixbuf, libseccomp, libcap, libxml2, zstd, libportal, wayland | Target |

## Phases

### Phase 1 — Simple standalone tools (low effort, immediate value)

Build these three and add them to the container-tools profile or a new profile.

1. **fuse3** — meson, no deps. Need `fusermount3` binary + `libfuse3.so`.
2. **bubblewrap** — meson, depends on libcap (already in Hod). `bwrap` binary.
3. **xdg-dbus-proxy** — meson, depends on glib/gio (already in Hod). `xdg-dbus-proxy` binary.

**Acceptance:** `bwrap --ro-bind / / echo "sandbox works"` succeeds.

### Phase 2 — GPG signature chain

4. **libgpg-error** — autotools, no deps. Provides `libgpg-error.so` + `gpg-error` binary.
5. **gpgme** — autotools, depends on libgpg-error. Provides `libgpgme.so`. Check if `gpg` binary needed at build time — if so, may need a gnupg recipe or build-time workaround.

**Acceptance:** `pkg-config --libs gpgme` resolves.

### Phase 3 — OSTree (the hard part)

6. **e2fsprogs-libs** — autotools. Only build the `e2p` library (`lib/e2p`). Skip the full e2fsprogs tool suite (mke2fs, fsck, etc.) to minimize surface area. May need patching to build just the lib.
7. **ostree** — autotools with minimal features:
   ```
   --with-curl
   --without-soup
   --without-selinux
   --without-systemd
   --without-avahi
   --without-composefs
   --with-crypto=glib
   ```
   Needs `libglnx` submodule — either `git submodule update --init` in the build or bundle it in the source tarball.

**Acceptance:** `ostree --version` runs, `ostree repo init` works.

### Phase 4 — Flatpak

8. **flatpak** — meson with minimal features:
   ```
   -Dhttp_backend=curl
   -Dsystemd=disabled
   -Dsystem_helper=disabled
   -Dtests=false
   -Dman=false
   -Dgtkdoc=disabled
   -Dselinux_module=disabled
   -Dcurses=false
   ```

**Acceptance:** `flatpak --version` runs. `flatpak remote-add --user flathub https://flathub.org/repo/flathub.flatpakrepo` + `flatpak install --user flathub org.freedesktop.Sdk//stable` succeeds.

## Hard problems

### OSTree complexity
- ~150K LoC C, autotools, git submodules, many optional features
- Flatpak only uses the content-addressed object store, static deltas, and repo management — not bootloader/kernel/deployment
- Building minimally reduces complexity significantly
- `libglnx` submodule must be available (either recursive clone or vendored)

### e2fsprogs-libs
- Need only `lib/e2p` (ext2 partition attribute library)
- The full e2fsprogs build is ~100K LoC with many tools we don't need
- Options: (a) build full e2fsprogs-libs and only ship `libe2p.so`, (b) patch the build to only compile the e2p subdir, (c) check if ostree's e2p usage can be made optional

### FUSE at build time
- Both ostree and flatpak check for `fusermount3` at configure/meson time
- FUSE kernel module must be loaded on the host for runtime use
- Build-time check may need `fusermount3` on PATH or a configure flag to skip it

### Bubblewrap runtime requirements
- Needs user namespaces (unprivileged) or setuid
- Modern kernels (>= 5.11) support unprivileged user namespaces
- No special build-time requirements beyond libcap

### gpgme build-time gnupg dependency
- gpgme's build may require `gpg` binary to run tests
- Can likely disable tests (`--disable-tests`) to avoid this
- If `gpg` is needed for build, may need a gnupg recipe or to patch the check

## Profile

Add all packages to a `profiles/container-tools.ts` update or create `profiles/flatpak.ts`:

```
flatpak profile:
  fuse3, bubblewrap, xdg-dbus-proxy, libgpg-error, gpgme,
  e2fsprogs-libs, ostree, flatpak
  + transitive deps from existing recipes
```

`flatpak` needs `XDG_DATA_DIRS` to find its runtime data. The existing profile env system should handle this.

## Dependency graph

```
flatpak
├── ostree (HARD)
│   ├── glib ✓
│   ├── curl ✓
│   ├── xz ✓
│   ├── zlib ✓
│   ├── e2fsprogs-libs (e2p) (NEW)
│   ├── libgpg-error (NEW)
│   ├── libarchive ✓
│   ├── fuse3 (NEW)
│   └── libmount (util-linux) ✓
├── bubblewrap (NEW, simple)
│   └── libcap ✓
├── xdg-dbus-proxy (NEW, simple)
│   └── glib ✓
├── gpgme (NEW)
│   └── libgpg-error (NEW)
├── json-glib ✓
├── appstream ✓
├── gdk-pixbuf ✓
├── libarchive ✓
├── libxml2 ✓
├── libseccomp ✓
├── libcap ✓
├── libzstd ✓
├── fuse3 (NEW)
├── curl ✓
├── libportal ✓
├── wayland ✓
└── wayland-protocols ✓
```

✓ = already in Hod, NEW = needs a recipe

## Estimated effort

| Phase | New recipes | Effort |
|-------|-----------|--------|
| Phase 1 | fuse3, bubblewrap, xdg-dbus-proxy | ~1-2 hours |
| Phase 2 | libgpg-error, gpgme | ~1-2 hours |
| Phase 3 | e2fsprogs-libs, ostree | ~4-8 hours (ostree is the hard one) |
| Phase 4 | flatpak | ~2-4 hours |
| **Total** | 8 new recipes | ~8-16 hours |
