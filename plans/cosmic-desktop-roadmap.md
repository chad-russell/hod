# COSMIC Desktop Environment Roadmap

**Status:** Paused
**Date:** 2026-05-19
**Current authority:** This document records the paused state; current desktop work has moved to `niri-desktop-roadmap.md`.

## Pause Summary

COSMIC component binaries build, and `cosmic-comp` can run in the Arch VM with
normal xdg-shell clients visible when using `just run-local-gl`. However, the
desktop shell is not yet usable. Debugging showed the remaining problems are not
single missing libraries; they are distro-integration issues:

- our recipes copied Rust binaries instead of using upstream install targets, so
  important data under `/share/cosmic`, D-Bus activation files, systemd user
  units, wallpaper assets, and applet metadata were incomplete
- broad `--no-default-features` diverged from Arch/NixOS package choices
- the real portal stack (`xdg-desktop-portal`, GTK/GNOME/COSMIC backends) is not packaged
- `cosmic-bg` defaults referenced a missing `/usr/share/backgrounds/cosmic/...` wallpaper
- stale `/home/hod/.local/state/cosmic-comp/outputs.ron` was baked into images and caused
  `F_ERR=Unable to find matching mode` across QEMU display changes
- panel defaults referenced applets/components that are not all packaged or wired
- `cosmic-settings-daemon` and `cosmic-osd` currently spin at ~100% CPU in the VM

The conclusion is that COSMIC should resume only after Hod has a distro-style
desktop packaging layer: upstream install target support, real portal packaging,
systemd user units, D-Bus activation, and path-linked desktop data.

## Goal

Build the COSMIC desktop environment from source using Hod, and produce a bootable VM where the entire COSMIC desktop runs from the hod content-addressed store.

**Current note:** COSMIC is now the full desktop phase of
`minimal-hod-vm-roadmap.md`. Start with that roadmap when working on VM boot,
rootfs, base distro boundaries, and image harnessing. Use this document for the
COSMIC-specific dependency and component build plan.

## End State

A QEMU VM that:

1. Boots a Linux kernel into systemd
2. systemd starts `cosmic-session` from the hod store
3. `cosmic-session` launches `cosmic-comp` (Wayland compositor), `cosmic-panel`, and all desktop services
4. User interacts with COSMIC apps (Files, Edit, Term, Settings, Launcher) — all built and relocated from the hod store
5. GPU rendering works via Mesa (llvmpipe software rendering at minimum; virtio-gpu hardware rendering ideally)

## Target Components (8 core + supporting)

| Component | Role | Criticality |
|-----------|------|-------------|
| `cosmic-comp` | Wayland compositor (Smithay + wgpu) | **Essential** |
| `cosmic-session` | Session manager, starts all services | **Essential** |
| `cosmic-panel` | Top/bottom panel (taskbar, system tray, clock) | **Essential** |
| `cosmic-settings` | System settings application | Core |
| `cosmic-files` | File manager | Core |
| `cosmic-edit` | Text editor | Core |
| `cosmic-term` | Terminal emulator | Core |
| `cosmic-launcher` | App launcher (search + grid) | Core |

Supporting components needed by the above:

| Component | Role |
|-----------|------|
| `cosmic-settings-daemon` | D-Bus settings broadcast service |
| `cosmic-bg` | Wallpaper/background service |
| `cosmic-idle` | Idle detection / screen blanking |
| `cosmic-randr` | Display configuration |
| `cosmic-notifications` | Notification daemon |
| `cosmic-osd` | On-screen display (volume, brightness) |
| `cosmic-icons` | Icon theme (data-only) |
| `cosmic-workspaces-epoch` | Workspace overview |
| `cosmic-screenshot` | Screenshot tool |
| `xdg-desktop-portal-cosmic` | XDG desktop portal for sandboxed apps |
| `pop-launcher` | Launcher service (library + plugins) |
| `cosmic-applets` | Panel applets |
| `cosmic-applibrary` | Application library/grid view |
| `cosmic-theme-editor` | Theme editor |

COSMIC Rust libraries (built as part of the component builds via vendored deps):

| Library | Role |
|---------|------|
| `libcosmic` | GUI toolkit (Iced-based widgets, theming, windowing) |
| `cosmic-protocols` | Wayland protocol extensions |
| `cosmic-text` | Text layout/shaping engine |
| `cosmic-theme` | Theme definitions |
| `cosmic-time` | Time/calendar utilities |

---

## What We Already Have

These recipes exist and will be reused directly:

**Build tools:** meson, ninja, python, pkgconf, autoconf, automake, bison, flex, m4, make, perl, patchelf

**Core libs:** zlib, bzip2, xz, zstd, expat, libffi, pcre2, openssl, libxml2, sqlite

**X11 stack:** xorgproto, libXau, libXdmcp, libxcb, libX11, libXext, libXfixes, libXi, libXrandr, libXrender, libXdamage, libXcomposite, libXcursor, libXinerama, libXtst, xcb-proto, xtrans, libpthread-stubs

**Graphics/text:** wayland, wayland-protocols, libdrm, libxkbcommon, fontconfig, freetype, harfbuzz, fribidi, pixman, cairo, pango, glib, gdk-pixbuf, graphene, libepoxy

**Desktop:** dbus, at-spi2-core, shared-mime-info, gtk3, gtk4, libadwaita, gsettings-desktop-schemas, nautilus, geany, sassc, appstream, tinysparql, xmlb

**Rust toolchain:** rust 1.95.0 (rustc + cargo), `cargoBuild` helper, `rustProfile` helper, 18+ existing Rust recipes

**Other:** curl, ncurses, readline, bash, coreutils, git, strace, gdb, openssh, and many CLI tools

---

## Phase 1: Mesa / GPU Graphics Stack

**Why first:** COSMIC's compositor (`cosmic-comp`) uses Smithay + wgpu for GPU rendering. We cannot run a Wayland compositor without a working EGL/GLES stack. Mesa is the hardest single dependency in this entire roadmap, so tackling it first de-risks everything that follows.

**Estimated new packages:** ~10–15

### 1.1 Build Tool Prerequisites

New recipes needed for Mesa's build:

- [x] **mako** (Python package) — Mesa generates source code with Mako templates.
  Install as a Python site-packages addition, similar to our meson approach.
  Built: `recipes/native/mako/mako.ts` (Mako 1.3.12 + MarkupSafe 3.0.3).
- [x] **libxshmfence** — Shared memory fences, needed for DRI3.
  Small X11 library. autotools.
  Built: `recipes/native/libxshmfence/libxshmfence.ts` (v1.3.3).
- [x] **libXxf86vm** — XF86 VidMode extension. Needed for GLX.
  Small X11 library. autotools.
  Built: `recipes/native/libXxf86vm/libXxf86vm.ts` (v1.1.7).

### 1.2 LLVM

- [x] **LLVM** — prebuilt binary installation with store-relative relocation.
  Built: `recipes/native/llvm/llvm.ts` (LLVM 22.1.5 prebuilt).
  Installs 220 static `.a` libraries, headers, cmake files, llvm-config.
  No `libLLVM.so` in prebuilt — Mesa links LLVM statically via meson binary wrap.

  **Strategy: prebuilt binaries, same as Rust toolchain.**

  The LLVM project releases prebuilt binaries for x86_64 Linux that include
  everything Mesa needs: `llvm-config`, C/C++ headers, CMake files, and
  `libLLVM.so`. Our relocation pipeline already proves prebuilt `libLLVM.so`
  works (it ships inside the Rust toolchain and gets RUNPATH-patched).

  Download the official LLVM release tarball (e.g., LLVM 19.x) from
  `https://github.com/llvm/llvm-project/releases`, hash-verify it, and
  install into the store. Recipe pattern mirrors `rust/rust.ts`:
  - `fetchTarball` for the download
  - `shellBuild` to copy into `$OUT` (bin/, lib/, include/, lib/cmake/)
  - Strip executables but not shared libs
  - `runtime_deps: ["toolchain", "zlib", "zstd"]` (libLLVM.so links against these)
  - Hod's RUNPATH patching handles the rest

  Version selection: match what Rust 1.95.0 bundles internally, or use the
  latest stable LLVM that Mesa supports (LLVM 18–19 for Mesa 24–25).

  **Future work:** Build LLVM from source as a trust-reduction milestone
  (analogous to eventually building the Rust toolchain from source).
  This is deferred until the COSMIC desktop is proven working.

  **Meson integration with Mesa:** The prebuilt `llvm-config` outputs
  hard-coded paths from the original build (e.g., `--prefix=/usr`).
  Mesa supports three ways to find LLVM:

  1. `llvm-config` on PATH or via native file
  2. CMake finder (only finds static libs — not useful)
  3. **Binary wrap** (`subprojects/llvm/meson.build`) — declares the
     dependency with explicit paths, bypassing `llvm-config` entirely

  Option 3 is the cleanest for hod. We write a `meson.build` that
  points at `/deps/llvm/include`, `/deps/llvm/lib`, etc. and declares
  the LLVM version. Mesa's docs show the exact pattern.

  Alternative: patch `llvm-config` to output `/deps/llvm` paths, or
  wrap it in a shell script that overrides specific flags.

  Deps: toolchain, zlib, zstd (for libLLVM.so runtime).
  Build-time only: no cmake/ninja needed since we're not compiling.

### 1.3 libglvnd

- [x] **libglvnd** — EGL/GL vendor-neutral dispatch library.
  Small Meson build. Provides `libEGL.so`, `libGL.so`, `libGLESv2.so` as dispatchers.
  Deps: toolchain, meson, ninja, python, zlib, expat, libX11 + X11 stack, wayland, libdrm.
  Built: `recipes/native/libglvnd/libglvnd.ts` (v1.7.0).

### 1.4 Mesa

- [x] **Mesa 26.0.7** — GPU driver stack with llvmpipe software rasterizer.
  Built: `recipes/native/mesa/mesa.ts`.

  Build configuration:
  - Gallium drivers: `llvmpipe` (software rasterizer via LLVM JIT)
  - Vulkan drivers: none (can add lavapipe later for wgpu Vulkan backend)
  - EGL platform: `wayland`, `x11`
  - GBM: enabled
  - GLX: dri mode
  - GLES2: enabled, GLES1: disabled
  - valgrind, libunwind: disabled
  - `cpp_rtti=false` (LLVM prebuilt was built without RTTI)
  - `shared-llvm=false` (LLVM linked statically into gallium driver)

  **Key outputs:**
  - `libgallium-26.0.7.so` (61 MB, contains llvmpipe + LLVM JIT)
  - `libEGL_mesa.so` (EGL vendor implementation)
  - `libGLX_mesa.so` (GLX vendor implementation)
  - `libgbm.so` (Generic Buffer Manager)
  - `lib/dri/swrast_dri.so`, `kms_swrast_dri.so` (DRI drivers)
  - `lib/gbm/dri_gbm.so` (GBM backend)
  - `share/glvnd/egl_vendor.d/50_mesa.json` (EGL vendor registry)

  **LLVM integration:**
  LLVM is linked statically — NOT a runtime dep. The llvm-config wrapper
  remaps staging paths to `/deps/llvm` and fixes `--system-libs` hardcoded
  `/usr/lib/*.a` paths. A meson native file (`/tmp/native.ini`) tells meson
  to use the wrapper instead of searching PATH.

  **Build deps:** LLVM, libglvnd, libdrm, wayland, wayland-protocols, libX11 stack,
  expat, zlib, zstd, libxml2, python + mako + pyyaml + packaging, flex + bison + m4.

  **Runtime deps:** libdrm, libglvnd, wayland, zlib, expat, zstd, libX11 stack, libxshmfence, toolchain.
  (LLVM is NOT a runtime dep — linked statically.)

### 1.5 Validation

- [ ] Confirm `eglinfo` shows EGL devices with llvmpipe
- [ ] Confirm `glxinfo` shows GLX with llvmpipe
- [ ] Run a simple EGL/GL program from the store (e.g., a minimal wgpu example)
- [x] Confirm Mesa's shared libraries are found via hod's RUNPATH/relocation
  (RUNPATH verified: `$ORIGIN/../lib` + all runtime dep paths present)

**Phase 1 status:** Mesa builds successfully. Validation of rendering (1.5) can be done alongside Phase 2.

**Phase 1 exit criteria:** We can build and run an EGL/GLES program from the hod store with software rendering (llvmpipe).

---

## Phase 2: COSMIC C Library Dependencies

**Goal:** Build all the C shared libraries that COSMIC components link against at runtime.

**Estimated new packages:** ~15–25 (depends on how deep the systemd dependency chain goes)

### 2.1 systemd (libudev + libsystemd)

COSMIC deeply integrates with systemd: `cosmic-comp` uses logind (seat/session tracking), `cosmic-session` depends on systemd user session, `libinput` needs libudev.

**Strategy decision:** For the first VM, we use **eudev** (standalone udev fork) instead of systemd to provide `libudev.so`. This avoids the massive systemd build complexity. COSMIC's seat management uses seatd, not logind. If we find we need libsystemd/logind later, we can add elogind.

- [x] **util-linux 2.42.1** — libblkid, libuuid, libmount.
  Meson build, disabled most utilities to keep build lean.
  Built: `recipes/native/util-linux/util-linux.ts`.
  Runtime deps: toolchain.
- [ ] **libcap** — Capability library. May be needed by systemd/elogind later.
  Deferring until needed.
- [x] **kmod 34** — Linux kernel module management library.
  Meson build, tools disabled.
  Built: `recipes/native/kmod/kmod.ts`.
  Runtime deps: openssl, toolchain, xz, zlib, zstd.
- [x] **eudev 3.2.14** — Standalone udev providing `libudev.so`.
  Autotools build requiring autoreconf. Complex setup:
  - PERL5LIB for autoconf/automake perl scripts
  - ACLOCAL_PATH for libtool + pkgconf m4 macros
  - Patched libtoolize to fix //share paths from prefix=/
  - Created /usr/bin/env symlink for scripts with #!/usr/bin/env
  Built: `recipes/native/eudev/eudev.ts`.
  Runtime deps: kmod, toolchain, util-linux.

### 2.2 Input Stack

- [x] **libevdev 1.9.1** — Evdev event handling library.
  Meson build. Needs python for header generation.
  Built: `recipes/native/libevdev/libevdev.ts`.
  Runtime deps: toolchain.
- [x] **mtdev 1.1.7** — Multitouch event translation.
  Autotools build.
  Built: `recipes/native/mtdev/mtdev.ts`.
  Runtime deps: toolchain.
- [x] **libinput 1.27.0** — Input device management.
  Meson build. Deps: libevdev, mtdev, eudev, seatd.
  libwacom disabled (not needed for VM without tablets).
  Built: `recipes/native/libinput/libinput.ts`.
  Runtime deps: eudev, seatd, toolchain.
- [ ] **libwacom** — Wacom tablet library (optional, deferred).
  Not needed for VM without tablet devices.
- [x] **seatd 0.9.3** — Seat management library + daemon.
  COSMIC uses seatd as its seat backend.
  Meson build.
  Built: `recipes/native/seatd/seatd.ts`.
  Runtime deps: toolchain.

### 2.3 Display Stack

- [x] **libdisplay-info 0.3.0** — EDID/DisplayID parsing.
  Meson build. Needs python for code generation, hwdata for pnp.ids.
  Built: `recipes/native/libdisplay-info/libdisplay-info.ts`.
  Runtime deps: toolchain.
- [x] **hwdata 0.407** — Hardware ID databases.
  Data-only package (no compilation).
  Built: `recipes/native/hwdata/hwdata.ts`.
- [x] **libgbm** — Provided by Mesa directly (libgbm.so comes from Mesa build).

### 2.4 Audio / Media Stack

Needed for `cosmic-settings` (audio settings), `cosmic-panel` (volume applet),
`cosmic-osd` (volume overlay), `cosmic-settings-daemon` (pulse subscription), and
`xdg-desktop-portal-cosmic` (screencast portal).

- [x] **alsa-lib 1.2.14** — Advanced Linux Sound Architecture library.
  autotools (official tarball from alsa-project.org).
  Built: `recipes/native/alsa-lib/alsa-lib.ts`.
  Runtime deps: toolchain.
  Required `tar_bz2` support in hod (added to `ArchiveFormat` enum and `fetchTarball`).
- [x] **pipewire 1.4.7** — Media graph framework.
  Meson build with minimal config: spa-plugins + alsa + dbus + udev enabled;
  bluez5, jack, v4l2, ffmpeg, gstreamer, webrtc, opus, sndfile, avahi, sdl2,
  flatpak, snap, selinux, systemd, logind, session-managers all disabled.
  Built: `recipes/native/pipewire/pipewire.ts`.
  Deps: toolchain, meson, ninja, python, dbus, alsa-lib, openssl, expat, zlib, eudev.
  Runtime deps: alsa, dbus, eudev, openssl, toolchain.
  Key outputs: `libpipewire-0.3.so`, `libspa-0.2.so` (SPA plugins),
  `pipewire-pulse` (PulseAudio compat symlink), ALSA config.
- [x] **PulseAudio client library (`libpulse.so.0`)** — BUILT.
  PulseAudio 17.0, meson build with `-Ddaemon=false` and all optional features disabled.
  Built: `recipes/native/pulseaudio/pulseaudio.ts`.
  Deps: toolchain, meson, ninja, python, zlib, m4.
  Runtime deps: toolchain.
  Key outputs: `libpulse.so.0.24.3`, `libpulse-simple.so.0.1.1`, `libpulsecommon-17.0.so`,
  headers in `include/pulse/`, `lib/pkgconfig/libpulse.pc`.
  **Patches applied:**
  - sndfile dependency made optional (only needed by daemon, not client lib)
  - sndfile-util.c/h removed from libpulsecommon build
  - utils (pacat, pactl) excluded from build
  - libpulsecommon symlinked to `$OUT/lib/` for linker resolution

**Status:** alsa-lib, pipewire, and PulseAudio client library all built.

### 2.5 Other Dependencies

- [ ] **PAM** (Linux-PAM) — Needed for `cosmic-greeter` (login screen).
  Not strictly needed for our 8 core components, but may be needed by cosmic-session.
  autotools. Deps: toolchain.
- [ ] **gstreamer** — Multimedia framework. May be needed by cosmic-settings.
  Meson build. Large dependency tree.
- [ ] **gstreamer-plugins-base** — Base GStreamer plugins.
  Meson build. Deps: gstreamer, alsa-lib, libglvnd, wayland, zlib.

**Note on libclang:** Originally listed as a dependency for Rust `bindgen`. This turned out
not to be needed — the `-sys` crates ship pre-generated FFI bindings. LLVM is included
in build deps for potential future use but is not required for bindgen.

### 2.6 Validation

- [x] All C libraries build and install with proper pkg-config metadata
- [x] Runtime dependency chains are correct (hod closure on cosmic-session shows 37 deps)
- [x] All binaries properly relocated (RUNPATH patching + wrapper scripts verified)

**Phase 2 status:** ✅ COMPLETE — all required C libraries built including alsa-lib, pipewire, and PulseAudio client library.

**Phase 2 exit criteria:** ✅ MET — all C dependencies for COSMIC components are available.

---

## Phase 3: COSMIC Rust Toolkit & Cargo Vendoring

**Goal:** Establish a reproducible, offline build strategy for COSMIC's Rust components and build the foundational Rust libraries.

**Estimated new packages:** ~5–8

### 3.1 Cargo Vendoring Strategy

COSMIC components depend on many Rust crates from crates.io plus git dependencies (pop-os crates). We need these vendored offline with content-hashed reproducibility.

**Approach:**

Implemented `fetchGit` as a first-class recipe type (analogous to Nix's `builtins.fetchGit`):
- New `GitFetch` recipe type (0x07) in Rust core
- `build_git_fetch` builder: clone, checkout, strip `.git`, verify hash
- TypeScript `fetchGit()` helper in `js/src/git-fetch.ts`
- Content-addressed and cacheable

**Phase A (current):** cargo with network access for crate downloads (semi-hermetic).
The -sys crates use pre-generated FFI bindings (no bindgen needed).
C library search paths provided via `LIBRARY_PATH` env var.

**Phase B (future):** Pre-vendor all dependencies with `cargo vendor`, build offline.

- [x] **fetchGit** — First-class git fetch recipe type
  Built: `js/src/git-fetch.ts`, `src/git_fetch.rs`, `src/recipe.rs` (GitFetch variant).
- [x] **cosmic-comp epoch-1.0.13** — Wayland compositor BUILT SUCCESSFULLY!
  Built: `recipes/native/cosmic-comp/cosmic-comp.ts`.
  Build deps: 48 C library deps, Rust toolchain, LLVM, ca-certificates.
  Runtime deps: eudev, fontconfig, freetype, libX11, libXcomposite, libXcursor,
    libXdamage, libXext, libXfixes, libXi, libXrandr, libXrender, libdisplay-info,
    libdrm, libglvnd, libinput, libxkbcommon, libxshmfence, mesa, pixman, seatd,
    toolchain, wayland.
  Build time: ~4 minutes (cold), ~3:45 (warm cache).
  Output: 27MB stripped ELF binary with store-relative RUNPATH.
- [x] **preBuildScript** — New `cargoBuild` / `cosmicApp` option for patching source
  before `cargo build`. Used by cosmic-settings and cosmic-applets to work around
  the cosmic-protocols `//` URL issue (see Risk #9 below).
- [ ] **cosmic-vendor** — Vendor bundle recipe (for Phase B hermetic builds)
- [ ] Validate: cargo can build offline using the vendored deps

**Key discovery:** Rust `-sys` crates (drm-sys, input-sys, pixman-sys, gbm-sys,
xkbcommon-sys) ship with pre-generated FFI bindings for x86_64-linux. When the
`use_bindgen` feature is off (default), their `build.rs` is empty — they don't
even emit `cargo:rustc-link-search` flags. The linker finds libraries via
`LIBRARY_PATH` env var instead of pkg-config.

### 3.2 COSMIC Rust Libraries

These are built as part of the component builds (they're Cargo dependencies), but some may need special handling:

- [x] **cosmic-protocols** — Wayland protocol extensions. Fetched via `fetchGit`.
  Built as transitive dep of cosmic-comp (vendored via cargo git deps).
- [x] **cosmic-text** — Text layout engine. C deps: fontconfig, freetype, harfbuzz via rustybuzz.
  Built as transitive dep of cosmic-comp.
- [x] **cosmic-theme** — Theme definitions. Pure Rust.
  Built as transitive dep of cosmic-comp.
- [x] **libcosmic** — The GUI toolkit. Depends on iced, wgpu, cosmic-text, cosmic-theme.
  Built as transitive dep of cosmic-comp via git dependency.

**Phase 3 status:** cosmic-comp builds successfully with all its Rust dependencies.

**Phase 3 exit criteria:** ✅ MET — `cosmic-comp` builds from source with all C and Rust dependencies resolved.

---

## Phase 4: COSMIC Desktop Components

**Goal:** Build all 8 core COSMIC components + required supporting components.

**Estimated new packages:** ~15 (8 core + ~7 supporting)

Each component follows the same pattern:
1. Source: git checkout at known commit
2. Build: `cargo build --offline --release` with vendored deps
3. Install: copy binaries to `$OUT/bin`, data files to `$OUT/share`, etc.
4. Runtime deps: all transitive C shared libs + toolchain

### 4.1 cosmic-comp (Compositor) — ✅ BUILT

- [x] Recipe for `cosmic-comp`
  Built: `recipes/native/cosmic-comp/cosmic-comp.ts` (epoch-1.0.13).
  27MB stripped ELF binary with store-relative RUNPATH.
  Wrapper script sets XDG_DATA_DIRS, GSETTINGS_SCHEMA_PATH.
  C link deps: libdisplay-info, libseat, libudev, libinput, libpixman-1, libxkbcommon, libgbm, libgcc_s, libc.
  Build deps: 48 C library deps, Rust toolchain, LLVM, ca-certificates.
  Build time: ~4 minutes (cold), ~3:45 (warm cache).

### 4.2 cosmic-session (Session Manager) — ✅ BUILT

- [x] Recipe for `cosmic-session`
  Built with `--no-default-features` (disables systemd/logind, uses seatd).
  The `autostart` feature is also disabled due to a cosmic-session bug where
  `is_systemd_used()` is called behind `#[cfg(autostart)]` but imported
  behind `#[cfg(systemd)]`.
  Output: 4.5M binary.

### 4.3 cosmic-panel (Panel / Taskbar) — ✅ BUILT

- [x] Recipe for `cosmic-panel`
  Uses Smithay with DRM/EGL backends for Wayland client rendering.
  Output: 17M binary.

### 4.4 cosmic-settings (Settings) — ✅ BUILT

- [x] Recipe for `cosmic-settings`
  Built: `recipes/native/cosmic-settings/cosmic-settings.ts` (epoch-1.0.13).
  Uses `preBuildScript` to comment out the `[patch.'cosmic-protocols']` section
  with `//` URLs (see Risk #9). This makes cargo resolve cosmic-protocols to
  rev `160b086` (the same version used by cosmic-comp) instead of the deleted
  `d0e95be` revision. Output: ~603MB binary. Build time: ~93s.
  Runtime deps: cosmic base set (now includes dbus, alsa, pipewire).

### 4.5 cosmic-files (File Manager) — ✅ BUILT

- [x] Recipe for `cosmic-files`
  Built with `--no-default-features --features wgpu,wayland,dbus-config,bzip2,desktop,notify`.
  Disables `gvfs` (needs gio/glib runtime) and `io-uring`.
  Output: 44M binary.

### 4.6 cosmic-edit (Text Editor) — ✅ BUILT

- [x] Recipe for `cosmic-edit`
  Built with `--no-default-features --features wgpu,wayland,dbus-config`.
  Output: 41M binary.

### 4.7 cosmic-term (Terminal) — ✅ BUILT

- [x] Recipe for `cosmic-term`
  Built with `--no-default-features --features wgpu,wayland,dbus-config`.
  Disables `password_manager` (needs secret-service D-Bus).
  Output: 39M binary.

### 4.8 cosmic-launcher (App Launcher) — ✅ BUILT

- [x] Recipe for `cosmic-launcher`
  Default features disabled to avoid `desktop-systemd-scope` and `tracing-journald`.
  Depends on `pop-launcher` service (also built).
  Output: 25M binary.

### 4.9 Supporting Components

These run as background services and are needed for a functional desktop:

- [x] `cosmic-settings-daemon` — ✅ BUILT. D-Bus settings broadcast service.
  Links against libpulse.so.0 for volume change subscriptions.
  Required adding OpenSSL to cosmic base deps (for reqwest crate).
  Output: binary + wrapper script.
- [x] `cosmic-bg` — ✅ BUILT. Wallpaper rendering service (8.8M)
- [x] `cosmic-idle` — ✅ BUILT. Idle detection/screen blanking (4.9M)
- [x] `cosmic-randr` — ✅ BUILT. Display configuration CLI (1.8M)
- [x] `cosmic-notifications` — ✅ BUILT. Notification daemon (21M)
- [x] `cosmic-osd` — ✅ BUILT. On-screen display for volume, brightness, polkit.
  Links against libpulse.so.0 for volume queries.
  Output: binary + wrapper script.
- [x] `cosmic-screenshot` — ✅ BUILT. Screenshot tool (3.0M)
- [x] `cosmic-icons` — ✅ BUILT. Icon theme (data-only)
- [x] `cosmic-workspaces-epoch` — ✅ BUILT. Workspace overview (23M)
- [x] `cosmic-applets` — ✅ BUILT. 9 panel applets (battery, bluetooth, minimize,
  network, notifications, power, status-area, time, plus audio applet attempted).
  Uses `preBuildScript` to comment out cosmic-protocols `//` URL patch section.
  Builds specific `-p` packages to avoid workspace members needing libdbus-sys
  and pipewire-sys bindgen. Audio applet excluded (needs pipewire-sys bindgen
  which requires `libpulse.so.0`). Output: 8 binaries + 8 wrapper scripts.
  Built: `recipes/native/cosmic-applets/cosmic-applets.ts`.
- [x] `cosmic-applibrary` — ✅ BUILT. Application library view (26M)
- [ ] `xdg-desktop-portal-cosmic` — 🟡 IN PROGRESS: bindgen/libclang exec stack root cause
  identified and partially fixed. See Risk #13 update below.
  - **Root cause found:** hod's RUNPATH patching in `packed.rs` repurposed the
    `PT_GNU_STACK` program header of `libclang.so` as a new `PT_LOAD` segment,
    causing the ELF to lose its `GNU_STACK RW` marker. glibc's dynamic linker
    then defaults to requesting executable stack for libraries without
    `PT_GNU_STACK`, and `mprotect(PROT_EXEC)` is rejected in user namespaces.
  - **Fix 1 (merged):** `find_phdr_slot()` now prefers gap-fill over GNU_STACK
    repurpose (non-destructive first).
  - **Fix 2 (merged):** New `patch_runpath_extend_last_load()` strategy that
    appends relocated `.dynstr` at end of file and extends the last `PT_LOAD`
    segment — no new program header slot needed, GNU_STACK fully preserved.
  - **Current state:** libclang.so now retains `GNU_STACK RW`. The "cannot
    enable executable stack" dlopen error is resolved. However, `libspa-sys`
    build script now SIGSEGVs — likely a secondary issue with the bindgen
    invocation or header paths. Under investigation.
- [x] `pop-launcher` — ✅ BUILT. Launcher service (8.2M)
- [ ] `cosmic-theme-editor` — Not yet attempted

**Phase 4 status:** 18 of 19 components build. xdg-desktop-portal-cosmic in progress:
- Original blocker ("cannot enable executable stack") resolved via RUNPATH patching fix
- New blocker: `libspa-sys` build script SIGSEGVs during bindgen invocation — under investigation

### 4.10 Validation

- [x] Each component builds and produces a working binary (18 of 19)
- [x] `hod closure` on `cosmic-session` resolves all runtime deps
- [x] All binaries are properly relocated (RUNPATH patching verified)

**Phase 4 exit criteria:** ✅ MET — 8 of 8 core components build. 18 of 19 total components build.
Only `xdg-desktop-portal-cosmic` remains — exec-stack root cause fixed, investigating libspa-sys SIGSEGV.

### 4.11 Infrastructure Changes (Phase 4)

Key infrastructure added during this phase:

- **`preBuildScript` option** in `cargoBuild` and `cosmicApp` — injects shell commands
  between source extraction and `cargo build`. Used for patching Cargo.toml files.

- **`tar_bz2` archive format** — added to hod's `ArchiveFormat` enum (Rust: `TarBz2 = 0x03`,
  build.rs: `-xjf` flag) and TypeScript SDK (`unpack.ts`, `fetch.ts`).

- **dbus, alsa-lib, pipewire, pulseaudio, openssl added to cosmic base deps** —
  `cosmic.ts` now includes:
  - dbus (needed by libcosmic's `dbus-config` feature → zbus → libdbus-sys)
  - alsa-lib and pipewire (needed by cosmic-applet-audio and other audio components)
  - pulseaudio (needed by cosmic-osd and cosmic-settings-daemon for libpulse.so.0)
  - openssl (needed by cosmic-settings-daemon for reqwest/native-tls)
  All env vars (PKG_CONFIG_PATH, C_INCLUDE_PATH, LIBRARY_PATH, LD_LIBRARY_PATH)
  and runtime_deps updated accordingly.

- **cosmic-protocols `//` URL workaround** — The `//` suffix in `[patch]` URLs is
  intentional (cargo requires patch sources to differ from original sources), but
  causes 404 with cargo's built-in libgit2 HTTPS client. Fix: `preBuildScript` comments out
  the `//` patch lines, letting cargo resolve to the default rev (`160b086`).

- **PulseAudio client library build patches** — PulseAudio 17.0 built with
  `-Ddaemon=false` plus patches to make sndfile optional (daemon-only dependency),
  remove sndfile-util from libpulsecommon, and skip utils (pacat, pactl).
  libpulsecommon symlinked to `$OUT/lib/` for linker transitive dep resolution.

- **RUNPATH patching GNU_STACK preservation** — Fixed a bug where `packed.rs`
  destroyed `PT_GNU_STACK` when repurposing it as a `PT_LOAD` segment for
  long RUNPATH strings. This caused glibc to request executable stack for
  affected .so files (like libclang.so), which `mprotect(PROT_EXEC)` rejects
  in user namespaces. Fix: new `patch_runpath_extend_last_load()` strategy
  extends the last existing PT_LOAD instead of creating a new one. Also
  swapped `find_phdr_slot()` to prefer non-destructive gap-fill first.

---

## Phase 5: VM Image

**Goal:** Produce a bootable QEMU disk image running the COSMIC desktop from the hod store.

**Estimated new packages:** ~3–5

### 5.1 Base System Strategy

Start from Arch Linux bootstrap:

- [ ] Create an Arch Linux rootfs using `pacstrap` (or download a base image)
- [ ] Install minimal packages: `base`, `linux` (kernel), `systemd`, `dbus`
- [ ] Install QEMU guest agents: `qemu-guest-agent`
- [ ] Do NOT install any desktop environment — COSMIC comes from hod

Alternative: Build a minimal rootfs entirely from hod recipes (future goal, not Phase 5).

### 5.2 Hod Store Integration

- [ ] Install hod binary in the VM
- [ ] Copy COSMIC closure into the VM's hod store:
  ```
  hod copy-closure cosmic-session.ts --to vm-host
  ```
- [ ] Verify the closure is complete on the VM

### 5.3 Session Configuration

- [ ] Create a systemd user service or session file for `cosmic-session`
- [ ] Configure auto-login (or a simple TUI login that execs into cosmic-session)
- [ ] Set up environment: `XDG_RUNTIME_DIR`, `WAYLAND_DISPLAY`, `PATH` to include hod store bins
- [ ] Configure the kernel to use a suitable DRM driver (virtio-gpu or simpledrm)

### 5.4 QEMU Configuration

- [ ] QEMU launch script with:
  - `-device virtio-gpu` for GPU (or `-display sdl` for software rendering)
  - Enough RAM (4GB minimum for Mesa + COSMIC)
  - KVM acceleration if available
  - Serial console for debugging
- [ ] Disk image packaging (qcow2 or raw)

### 5.5 Validation

- [ ] VM boots to a login prompt
- [ ] After login, cosmic-session starts
- [ ] cosmic-comp initializes the Wayland compositor
- [ ] Desktop is visible: panel at top, wallpaper, launcher
- [ ] Can open cosmic-files, cosmic-edit, cosmic-term, cosmic-settings
- [ ] Can take screenshots with cosmic-screenshot
- [ ] Keyboard, mouse, and touchpad input work

**Phase 5 exit criteria:** A QEMU VM boots, starts COSMIC from the hod store, and presents a usable desktop environment.

---

## Dependency Graph (Actual Build Order)

```
Phase 1: Mesa Stack (COMPLETE)
├── LLVM 22.1.5 (prebuilt) ──┐
├── mako, pyyaml, packaging ─┼── Mesa 26.0.7 (llvmpipe)
├── libxshmfence, libXxf86vm│     │
└────────────────────────────┘     └── libglvnd 1.7.0

Phase 2: C Dependencies (COMPLETE)
├── util-linux ─── kmod ─── eudev (libudev)
├── libevdev, mtdev ─── libinput ─── seatd
├── libdisplay-info, hwdata
├── alsa-lib 1.2.14 ─── pipewire 1.4.7 (alsa + dbus + udev)
└── PulseAudio 17.0 (client-only: daemon=false, sndfile patched out)

Phase 3: Rust Toolkit (COMPLETE)
├── fetchGit recipe type
├── cosmic-comp epoch-1.0.13 (compositor)
│   └── libcosmic, cosmic-text, cosmic-theme (all transitive)
├── preBuildScript option for cargoBuild/cosmicApp
└── cosmicApp() helper + shared C dep set (now includes dbus, alsa, pipewire, pulseaudio, openssl)

Phase 4: COSMIC Components (18/19 BUILT, 1 IN PROGRESS)
├── ✅ cosmic-session ── manages desktop lifecycle
├── ✅ cosmic-panel    ── top panel / taskbar
├── ✅ cosmic-files    ── file manager
├── ✅ cosmic-edit     ── text editor
├── ✅ cosmic-term     ── terminal emulator
├── ✅ cosmic-launcher ── app launcher + pop-launcher service
├── ✅ cosmic-settings ── system settings
├── ✅ cosmic-bg, cosmic-idle, cosmic-randr, cosmic-screenshot
├── ✅ cosmic-notifications, cosmic-workspaces, cosmic-app-library
├── ✅ cosmic-icons (data-only)
├── ✅ cosmic-applets  ── 9 panel applets (audio excluded, needs bindgen)
├── ✅ cosmic-osd      ── volume/brightness overlay (unblocked by libpulse.so.0!)
├── ✅ cosmic-settings-daemon ── settings broadcast (unblocked by libpulse.so.0!)
└── 🟡 xdg-desktop-portal-cosmic ── exec stack fix landed, libspa-sys SIGSEGV under investigation

Phase 5: VM Image (NOT STARTED)
└── Arch base + kernel + hod store + COSMIC closure
```

---

## Estimated Scale

| Phase | New Recipes | Status | Key Result |
|-------|-------------|--------|-------------|
| 1. Mesa | ~8 | ✅ Complete | Mesa 26.0.7 + LLVM 22.1.5 + libglvnd |
| 2. C deps | ~15 | ✅ Complete | eudev, libinput, seatd, libdisplay-info, alsa-lib, pipewire, pulseaudio |
| 3. Rust toolkit | ~4 | ✅ Complete | fetchGit, cosmic-comp, libcosmic (transitive), preBuildScript |
| 4. COSMIC apps | ~22 | 🟡 18/19 built | 8/8 core + 10 supporting + pop-launcher + cosmic-icons; xdg-portal exec-stack fix landed |
| 5. VM image | ~3–5 | Not started | |
| **Total** | **~52** | | **47 recipes created** |

## Key Infrastructure Created

- `recipes/helpers/cosmic.ts` — `cosmicApp()` helper with shared deps/env/runtime_deps for all COSMIC components. Now includes dbus, alsa-lib, pipewire, pulseaudio, and openssl in base deps.
- `src/git_fetch.rs` — `GitFetch` recipe type (0x07): content-addressed git clone + checkout + hash verify
- `js/src/git-fetch.ts` — TypeScript `fetchGit()` helper
- `recipes/helpers/rust.ts` — `preBuildScript` option in `cargoBuild()` for patching source before build
- `src/recipe.rs` — `TarBz2` archive format (0x03) for `.tar.bz2` source tarballs
- 20 source recipes (`recipes/native/*/source.ts`) using `fetchGit` at epoch-1.0.13 commits
- 18 build recipes (`recipes/native/*/*.ts`) using `cosmicApp()` or `cargoBuild()`
- `LIBRARY_PATH` pattern for Rust `-sys` crates that don't emit `cargo:rustc-link-search`
- `src/packed.rs` — RUNPATH patching: gap-fill preferred over GNU_STACK repurpose;
  new `patch_runpath_extend_last_load()` strategy preserves PT_GNU_STACK by extending
  the last PT_LOAD segment instead of creating a new one (fixes libclang dlopen in sandbox)
- `recipes/native/alsa-lib/` — alsa-lib 1.2.14 (autotools)
- `recipes/native/pipewire/` — pipewire 1.4.7 (meson, minimal config)
- `recipes/native/pulseaudio/` — PulseAudio 17.0 client library (meson, daemon=false, sndfile patched)
- `recipes/native/libsndfile/` — libsndfile 1.0.31 source (not used, PulseAudio patched to skip sndfile)

## Challenges & Lessons Learned

1. **Binary names ≠ package names.** Many COSMIC components have different binary names than package names (e.g., repo `cosmic-applibrary` → binary `cosmic-app-library`; repo `pop-launcher` → binary `pop-launcher-bin`). The `name` field in `cosmicApp()` must match the `[[bin]]` name in Cargo.toml, not the package/repo name.

2. **Workspace member selection.** `cargo build` on a workspace root only builds the root crate. For workspaces where the binary is in a sub-crate (e.g., `pop-launcher/bin/`), use `-p pop-launcher-bin` to select it.

3. **Feature flag cascading.** COSMIC components have deep feature flag chains: `cosmic-files` → `libcosmic/wgpu` → `cosmic-text/fontconfig` → C sys crates. Disabling default features and re-enabling specific ones is often needed to avoid unwanted deps (systemd, gvfs/gio, pipewire).

4. **cosmicApp helper DRY.** All COSMIC components share the same ~48 C library deps. The `cosmicApp()` helper in `recipes/helpers/cosmic.ts` eliminates hundreds of lines of boilerplate per recipe.

5. **Build caching.** Hod's content-addressed cache works perfectly for Rust builds. Source recipes are cached by git hash, process recipes by their full dependency hash. Rebuilds of unchanged components complete in <1 second.

---

## Risks & Open Questions

### Resolved Risks

1. ~~**LLVM as prebuilt.**~~ ✅ Resolved. LLVM 22.1.5 prebuilt installed successfully. llvm-config path remapping solved with a wrapper script that intercepts `--prefix`, `--src-root`, `--system-libs` and remaps to `/deps/llvm`.

2. ~~**systemd build complexity.**~~ ✅ Resolved. Used eudev (standalone udev fork) instead of systemd. COSMIC uses seatd, not logind. cosmic-session built with `--no-default-features` to avoid systemd deps.

3. ~~**Mesa driver selection for VMs.**~~ Still deferred. llvmpipe (software) is guaranteed to work but slow. virgl (virtio-gpu) gives hardware acceleration in QEMU but needs kernel support. Need to test both paths.

4. ~~**cosmic-comp bindgen requirements.**~~ ✅ Resolved. Rust `-sys` crates (drm-sys, input-sys, pixman-sys, gbm-sys, xkbcommon-sys) ship **pre-generated FFI bindings** for x86_64-linux. When `use_bindgen` is off (default), `build.rs` is completely empty — no pkg-config, no libclang needed. GCC's `LIBRARY_PATH` env var provides the library search paths instead.

5. ~~**cosmic-protocols `//` URL issue.**~~ ✅ Resolved (partially). The `//` suffix in `[patch]` URLs is intentional (cargo requires different source URLs) but causes 404 with cargo's built-in git client. **Workaround:** `preBuildScript` comments out the `//` patch lines, letting cargo resolve to the default revision (`160b086` used by cosmic-comp). Applied to cosmic-settings and cosmic-applets. The `d0e95be` revision was NOT actually deleted — it still exists in the repo — but the `//` URL makes cargo's libgit2 fail to fetch it.

### Active Risks

3. **Mesa driver selection for VMs.** llvmpipe (software) is guaranteed to work but slow. virgl (virtio-gpu) gives hardware acceleration in QEMU but needs kernel support. Need to test both paths.

6. **Runtime library discovery.** COSMIC apps need to find icon themes, fonts, schemas, and other data files at runtime. Our wrapper/runtime_dep machinery from the GTK4 work generates wrapper scripts that set `XDG_DATA_DIRS` and `GSETTINGS_SCHEMA_PATH` from all runtime deps. This should work for COSMIC but needs validation in the VM.

7. **wgpu backend selection.** wgpu can use Vulkan or GL. For the VM, we need to decide which backend to target. Vulkan (via lavapipe or virgl) may have different requirements than GL (via llvmpipe). Need to test what works.

8. **Kernel / DRM in QEMU.** The VM kernel needs DRM/KMS support for cosmic-comp to initialize a display. `virtio_gpu` kernel module + QEMU's `-device virtio-gpu-pci` should work, but needs validation.

9. ~~**Git dependency volatility.**~~ ✅ Resolved for cosmic-settings and cosmic-applets via `preBuildScript` workaround. The `//` URL pattern in `[patch]` sections was the actual issue, not deleted revisions.

  10. ~~**Audio stack dependency.**~~ ✅ Resolved. Built PulseAudio 17.0 client library with
  daemon=false and sndfile patched out. `cosmic-osd` and `cosmic-settings-daemon` now build
  successfully. pipewire-pulse provides the runtime PulseAudio server.

11. **Cargo workspace resolution.** Cargo resolves the entire workspace's dependencies before building, even when `-p` selects specific packages. This means a broken dependency in one workspace member blocks all members. Encountered with `cosmic-applets` where some applets use pipewire-sys (needs bindgen). **Workaround:** Select specific `-p` packages.

12. **cosmic-session autostart bug.** The `autostart` feature calls `is_systemd_used()` which is imported behind `#[cfg(feature = "systemd")]`. Building with `autostart` but without `systemd` fails. **Workaround:** Disable `autostart` feature. Upstream should gate the `is_systemd_used()` call with `#[cfg(all(feature = "autostart", feature = "systemd"))]`.

  13. **libclang exec stack in sandbox.** ✅ ROOT CAUSE FOUND AND FIXED.
  `pipewire-sys` and `libspa-sys` use **bindgen** which `dlopen()`s `libclang.so`.
  The original error "cannot enable executable stack" was caused by hod's RUNPATH
  patching in `packed.rs` — the `find_phdr_slot()` function repurposed `PT_GNU_STACK`
  as a new `PT_LOAD` segment when extending `.dynstr` for long RUNPATH strings.
  This destroyed the `GNU_STACK RW` marker on `libclang.so.22.1.5`. glibc's dynamic
  linker then defaults to requiring executable stack for ELFs without `PT_GNU_STACK`,
  and `mprotect(PROT_EXEC)` is rejected inside user namespaces.

  **Fixes applied (both in `src/packed.rs`):**
  1. `find_phdr_slot()` now tries gap-fill (non-destructive) before GNU_STACK repurpose.
  2. New `patch_runpath_extend_last_load()` strategy: appends relocated `.dynstr`
     at end of file and extends the last `PT_LOAD` segment's `p_filesz`/`p_memsz`.
     No new program header slot needed — `PT_GNU_STACK` is fully preserved.
     This is tried before `patch_elf_with_new_segment()` in the extension chain.

  **Post-fix state:** libclang.so loads successfully inside the user namespace
  sandbox (the "cannot enable executable stack" error is gone). However,
  `libspa-sys v0.9.2` build script now crashes with SIGSEGV during bindgen
  invocation — this is a new/different issue, likely related to bindgen
  header paths or libclang ABI compatibility. Under investigation.

---

## Plan Maintenance

This plan is a living document. As each phase begins:
- Flesh out the sub-tasks with specific version numbers, commit hashes, and configure flags
- Mark completed items with `[x]`
- Add notes about issues encountered and workarounds found
- Update the dependency graph as we learn the actual build requirements

When the plan is substantially complete, update its status and move current authority pointers to the implementation files.
