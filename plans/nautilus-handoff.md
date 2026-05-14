# Nautilus (GNOME Files) — Build Handoff Document

**Date:** 2026-05-13 (updated 2026-05-14)
**Author:** Agent session (preceded by earlier session)
**Status:** In progress — Phase 6 ✅ COMPLETE, Phase 7 (Nautilus) next
**Target:** Nautilus **48.7** (latest stable, GNOME 48)

---

## 1. Goal

Build **Nautilus 48.7** (GNOME Files) using Hod. This is a Tier 4 package — a major milestone that exercises the full GTK4/libadwaita GUI pipeline.

---

## 2. Work Completed

### ✅ Phase 1: Simple new libs (all deps already existed)

| # | Package | Version | Recipe Hash | Output Hash | Notes |
|---|---------|---------|-------------|-------------|-------|
| 1 | **graphene** | 1.10.8 | `f8827b08…` | `9c6de945…` | GObject types enabled, shared lib. Required by GTK4. |
| 2 | **libarchive** | 3.7.7 | `ddfbeb5c…` | `d7e40f12…` | Autotools. With zlib/bz2/lzma/openssl/xml2. Required by gnome-autoar. |
| 3 | **libportal** | 0.9.0 | `ca4ac42b…` | `f44a0798…` | Core lib only (no GTK4 backend yet). Meson, only needs glib. |
| 4 | **json-glib** | 1.10.0 | `3740d9d1…` | `5798ef9f…` | Meson, only needs glib. Required by tinysparql. |
| 5 | **libseccomp** | 2.5.5 | `ff403ffe…` | `2ac78c18…` | Autotools. Needs gperf at build time. Required by gnome-desktop-4. |
| 6 | **xmlb** | 0.3.21 | `a58a8617…` | `0f69d8cd…` | Meson, only needs glib. Required by appstream. |
| 7 | **libfyaml** | 0.9.6 | `ba4176be…` | `62ce7bca…` | Autotools. Needs m4 + CXX set. Required by appstream. |
| 8 | **libunistring** | 1.3 | `920f1c0f…` | `21dc02c5…` | Autotools, with libiconv. Required by tinysparql. |

### ✅ Harfbuzz subset — already built

Harfbuzz 10.2.0 already produces `libharfbuzz-subset.so` unconditionally. No rebuild was needed. The plan's claim that `-Dsubset=enabled` was required was incorrect — the meson option doesn't even exist. The subset library is always built.

### ✅ Phase 2: Image libs + appstream

| # | Package | Version | Recipe Hash | Output Hash | Notes |
|---|---------|---------|-------------|-------------|-------|
| 9 | **libjpeg** (IJG) | 9e | `3e39eaf9…` | `595973cb…` | Autotools. Provides `libjpeg.so` and `-ljpeg`. |
| 10 | **libtiff** | 4.7.0 | `66860407…` | `1428f5b6…` | Autotools. Needs CXX set. With zlib/libjpeg/xz/zstd. |
| 11 | **gdk-pixbuf** (rebuilt) | 2.42.12 | `b9e40169…` | `955d40a3…` | Rebuilt with `-Djpeg=enabled -Dtiff=enabled`. Now has PNG/GIF/JPEG/TIFF. |
| 12 | **appstream** | 1.1.2 | `dbb965ee…` | `fde7e7c…` | **Hardest build so far.** C++20, meson. Needs gperf, LDFLAGS rpath-link dance, patch out `subdir('po')` etc. |

---

## 3. Lessons Learned / Build Recipe Patterns Discovered

### 3.1 `fetchTarball` `stripComponents`

Some tarballs use `./Package-Version/` format (e.g., `./AppStream-1.1.2/`). The default `stripComponents: 1` strips only one level, leaving `AppStream-1.1.2/` as the top-level directory. For these tarballs, use `stripComponents: 2`:
```typescript
const recipe = await fetchTarball({
  url: "...",
  hash: "...",
  stripComponents: 2,  // for ./Package-Version/ tarballs
});
```

### 3.2 Autotools packages need `LD_LIBRARY_PATH` for configure test programs

Autotools `./configure` compiles and **runs** test programs. In the sandbox, these programs can't find shared libraries via RUNPATH alone. Fix:
```bash
export LD_LIBRARY_PATH="/deps/zlib/lib:/deps/openssl/lib:..."
```

### 3.3 Meson packages need `LDFLAGS` with `-Wl,-rpath-link` for linking

Meson uses pkg-config to find libraries, but the linker still needs rpath-link hints for transitive shared library dependencies:
```bash
export LDFLAGS="$HOD_DUMMY_RPATH -Wl,-rpath-link,/deps/glib/lib -Wl,-rpath-link,/deps/curl/lib ..."
```

### 3.4 C++ packages need explicit `CXX` and `CPP`

The toolchain profile sets `CC` but not `CXX` or `CPP`. For any package with C++ code:
```bash
export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export CPP="/deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin -E"
```

### 3.5 Build tools needed as deps

Several packages need extra build tools beyond the toolchain:
- **gperf** — needed by libseccomp, appstream (add as `dep("gperf", gperfRecipe)` + `binDeps: ["gperf"]`)
- **m4** — needed by libfyaml (add as `dep("m4", m4Recipe)` + `binDeps: ["m4"]`)

### 3.6 `hod: open interp` — AT_EXECFN bootstrap fails for shebang-launched Python

When the kernel processes a script with a shebang like `#!/path/to/python3`, it sets AT_EXECFN to the **script path**, not the interpreter path. The Python binary's AT_EXECFN bootstrap code then computes `dirname(AT_EXECFN) + rel_path` which resolves relative to the script's directory, not the interpreter's. In the sandbox, this produces a path like `/tmp/88/.../lib/ld-linux-x86-64.so.2` which doesn't exist.

The fix is to NOT sed-change shebangs to point directly at Python. Instead:
1. Create `/usr/bin/env` → busybox (static, no bootstrap)
2. Create `/usr/bin/python3` → `#!/bin/sh\nexec /deps/python/bin/python3 "$@"`
3. Add `/usr/bin` to PATH

When the kernel processes `#!/usr/bin/env python3`, busybox env finds `/usr/bin/python3` on PATH, execs the shell wrapper, which then execs `/deps/python/bin/python3` directly. The AT_EXECFN is set to `/usr/bin/python3`, and the bootstrap correctly resolves `dirname(/usr/bin/python3) + ../../../88/...` to the toolchain's ld-linux.

### 3.7 Meson `capture: true` custom_targets fail in sandbox

Meson uses `meson.py --internal exe` for targets with `capture: true`. This spawns a Python subprocess that also hits the AT_EXECFN bootstrap issue. For trivial generated files, pre-generate them and patch meson.build to use `files()` instead.

### 3.8 EGL stub strategy for GTK4 without Mesa

GTK4's X11 backend unconditionally references EGL types and functions even when `HAVE_EGL` is not defined. Without an EGL implementation (Mesa), we need:
1. Stub EGL headers (`EGL/egl.h`, `epoxy/egl.h`) with type definitions
2. A stub C file providing function implementations that return safe defaults
3. The stub C file added as a source to the gdk-x11 static library via meson.build patching
4. The `gdkglcontext-egl.c` source file removed from the build

### 3.9 libadwaita requires sassc for SCSS compilation

libadwaita compiles SCSS stylesheets at build time using `sassc`. If `sassc` is not found on PATH, meson tries to fetch it as a git subproject, which fails in the sandbox. Solution: build `sassc` (which needs `libsass`) as a separate recipe and add it as a `binDeps` in the meson profile. sassc can be built with a simple Makefile against a static libsass.

### 3.10 Meson packages need direct deps in pkgConfigDeps

Even when a dependency's `.pc` files are transitively available through another package's pkg-config chain, meson requires explicit `dependency()` declarations. The `.pc` file must be directly on `PKG_CONFIG_PATH`. For example, even though GTK4 depends on glib, building libadwaita against GTK4 requires glib's `.pc` files to be explicitly on `PKG_CONFIG_PATH` too — meson discovers each dependency independently via pkg-config.

### 3.11 Data packages with .pc files in `share/pkgconfig/`

Some data packages install their `.pc` files in `share/pkgconfig/` instead of `lib/pkgconfig/`. The `cProfile()` helper only adds `lib/pkgconfig` directories to `PKG_CONFIG_PATH` from `pkgConfigDeps`. For these packages, use `pkgConfigPaths` to explicitly add the `share/pkgconfig` directory:
```typescript
pkgConfigPaths: [
  "/deps/xorgproto/share/pkgconfig",
  "/deps/gsettings-desktop-schemas/share/pkgconfig",
],
```
Packages known to use `share/pkgconfig/`: xorgproto, gsettings-desktop-schemas, xkeyboard-config, iso-codes.

### 3.12 Python subprocesses need full LD_LIBRARY_PATH

When a build invokes Python scripts (e.g., meson's `capture: true` targets), Python needs to find its runtime shared libraries (zlib, expat, libffi, etc.). Add all of Python's transitive deps to `LD_LIBRARY_PATH`:
```bash
export LD_LIBRARY_PATH="/deps/zlib/lib:/deps/openssl/lib:/deps/libffi/lib:/deps/expat/lib:..."
```
And include those deps in the recipe's `deps` array so they're mounted in the sandbox.

---

## 4. File Locations — New Recipes Created

```
recipes/native/
  gtk4/gtk4-source.ts                ✅ built
  gtk4/gtk4.ts                       ✅ built
  libdrm/libdrm-source.ts            ✅ built
  libdrm/libdrm.ts                   ✅ built
  gnome-autoar/gnome-autoar-source.ts ✅ built
  gnome-autoar/gnome-autoar.ts        ✅ built
  libadwaita/libadwaita-source.ts      ✅ built
  libadwaita/libadwaita.ts             ✅ built
  sassc/sassc-source.ts                ✅ built (new build tool)
  sassc/sassc.ts                       ✅ built (new build tool)
  libsoup3/libsoup3-source.ts          ✅ built
  libsoup3/libsoup3.ts                 ✅ built
  tinysparql/tinysparql-source.ts      ✅ built
  tinysparql/tinysparql.ts             ✅ built
  gsettings-desktop-schemas/gsettings-desktop-schemas-source.ts ✅ built
  gsettings-desktop-schemas/gsettings-desktop-schemas.ts        ✅ built
  xkeyboard-config/xkeyboard-config-source.ts ✅ built
  xkeyboard-config/xkeyboard-config.ts        ✅ built
  iso-codes/iso-codes-source.ts        ✅ built
  iso-codes/iso-codes.ts               ✅ built
  gnome-desktop/gnome-desktop-source.ts ✅ built
  gnome-desktop/gnome-desktop.ts        ✅ built
```

**Modified existing recipes:**
- `recipes/native/gdk-pixbuf/gdk-pixbuf.ts` — rebuilt with JPEG/TIFF enabled
- `recipes/native/harfbuzz/harfbuzz.ts` — rebuilt with `-Dglib=enabled`
- `recipes/native/libportal/libportal.ts` — rebuilt with GTK4 backend enabled

---

## 5. Source Tarballs Downloaded + Hashed (Ready to Use)

| Package | Version | URL | BLAKE3 |
|---|---|---|---|
| graphene | 1.10.8 | `https://download.gnome.org/sources/graphene/1.10/graphene-1.10.8.tar.xz` | `03eb8c40d25df4875acf0922e386c0fb4720189ff3ad22346d5659aea4647c7f` |
| libarchive | 3.7.7 | `https://github.com/libarchive/libarchive/releases/download/v3.7.7/libarchive-3.7.7.tar.xz` | `6e92274d5e3bfe782749ecbf473f8e3ae910ec1fad5b64ba6d1b518ab2cf12c3` |
| libportal | 0.9.0 | `https://github.com/flatpak/libportal/releases/download/0.9.0/libportal-0.9.0.tar.xz` | `5a4f1e2d5bf60a11b472159a2e0ad74ab33bbcb3287523de8a12f642f55cae20` |
| json-glib | 1.10.0 | `https://download.gnome.org/sources/json-glib/1.10/json-glib-1.10.0.tar.xz` | `16a238016b1a37c365afe1bb2f63de6b80a944848339c416b926274cb6004b28` |
| libseccomp | 2.5.5 | `https://github.com/seccomp/libseccomp/releases/download/v2.5.5/libseccomp-2.5.5.tar.gz` | `517b336898a08a79db13f663df66079bf8dea174e8e1e9d3fdbbb868666a6a2a` |
| xmlb | 0.3.21 | `https://github.com/hughsie/libxmlb/releases/download/0.3.21/libxmlb-0.3.21.tar.xz` | `03ef0f3d18037f2979cf03d2ff4e1d212df1cf0dbff73aed7cfd660ee693cb28` |
| libunistring | 1.3 | `https://ftp.gnu.org/gnu/libunistring/libunistring-1.3.tar.xz` | `d3ad1c54e87fafb4533cf04929bdc10952fd8d691a2d9c1643440b7daa6cc71b` |
| libfyaml | 0.9.6 | `https://github.com/pantoniou/libfyaml/releases/download/v0.9.6/libfyaml-0.9.6.tar.gz` | `18c2deb847c782bcccaabd18bed64a6ad7ab9f900794913bd3b0435b2ddf6112` |
| libjpeg (IJG) | 9e | `https://www.ijg.org/files/jpegsrc.v9e.tar.gz` | `f0d6072e15de609397cbd8428758d7054dd921dc448018111e3822b17bcbcc5d` |
| libtiff | 4.7.0 | `https://download.osgeo.org/libtiff/tiff-4.7.0.tar.xz` | `c6bd40f905f71eff697812c8fd4f557bdb82f944ae637382cdc687710de8f0ca` |
| appstream | 1.1.2 | `https://www.freedesktop.org/software/appstream/releases/AppStream-1.1.2.tar.xz` | `5e4685b2100d861b842665b35f4a84c3f337650cac9c8034b2a7a575ee6ea10a` |
| **GTK4** | **4.18.6** | `https://download.gnome.org/sources/gtk/4.18/gtk-4.18.6.tar.xz` | `d5f27bcef858ce154121f5c08ac9a6a207d430143e306e20eb036ba1b1e89f19` |
| **libdrm** | **2.4.124** | `https://dri.freedesktop.org/libdrm/libdrm-2.4.124.tar.xz` | `12ac36a801c1a7c30b649797d64ebd18f50a87f7c840d9096822d6063355ee18` |
| **gnome-autoar** | **0.4.5** | `https://download.gnome.org/sources/gnome-autoar/0.4/gnome-autoar-0.4.5.tar.xz` | `71d55fad5525d1307886cb284d8594073d60da11359ac906af10eb9924067c74` |
| **libadwaita** | **1.7.12** | `https://download.gnome.org/sources/libadwaita/1.7/libadwaita-1.7.12.tar.xz` | `c11d18bc9de2185dd5f14a7a0eca49fcecdd92683c80d85b26d13a2655b6409a` |
| **sassc** | **3.6.2** | `https://github.com/sass/sassc/archive/refs/tags/3.6.2.tar.gz` | `b335ce7f38763cbd5a3733dcb9032fb7f2a15fe7f70199612ca1748639c72d47` |
| **libsass** | **3.6.5** | `https://github.com/sass/libsass/archive/refs/tags/3.6.5.tar.gz` | `e3f4d3691bb7335d8571ea8f3b79f38294a331d65b5b952242178881c1f12d4b` |

**Note:** GTK4 tarball downloaded and hashed but **not yet built**. Tarball uses `gtk-4.18.6/` top-level directory (normal `stripComponents: 1`).

---

## 6. Remaining Build Order

### ✅ Phase 3: GTK4 (THE pivotal build)

13. **GTK4 (4.18.6)** — source tarball downloaded + hashed (BLAKE3: `d5f27bcef858ce154121f5c08ac9a6a207d430143e306e20eb036ba1b1e89f19`)
    - Recipe: `recipes/native/gtk4/gtk4.ts`
    - Output hash: `c72d31dea25ed554423bc95dda4a086f10a05c42c271e343dd0cc61e0c028e74`
    - X11 backend only (wayland disabled)
    - No Vulkan, media, introspection, demos, tests, print backends
    - **Key build challenges and solutions:**
      - **`hod: open interp` when exec'ing Python from ninja:** When the kernel processes a shebang script, it sets AT_EXECFN to the SCRIPT path, not the interpreter. The Python binary's AT_EXECFN bootstrap then computes the wrong ld-linux path. Fixed by NOT changing shebangs and instead providing `/usr/bin/python3` as a shell wrapper that exec's Python directly.
      - **`/usr/bin/env python3` shebangs:** Created `/usr/bin/env` → busybox, `/usr/bin/python3` → shell wrapper, added both to PATH.
      - **`capture: true` custom_target for profile_conf.h:** Meson's `--internal exe` spawns Python subprocesses that hit the AT_EXECFN bootstrap issue. Fixed by pre-generating the file and patching meson.build to use `files()` instead.
      - **Missing `epoxy/egl.h`:** Our libepoxy was built without EGL. Fixed by: (a) creating stub EGL headers, (b) removing `gdkglcontext-egl.c` from the build, (c) adding an EGL stub C file to provide missing symbols (`eglQueryString`, `gdk_display_init_egl`, etc.).
      - **Missing `hb-glib.h`:** HarfBuzz was built without GLib integration. Fixed by rebuilding HarfBuzz with `-Dglib=enabled` and adding glib as a dependency.

### ✅ Phase 3.5: HarfBuzz rebuild with GLib integration

- **HarfBuzz (10.2.0)** rebuilt with `-Dglib=enabled` to provide `hb-glib.h` needed by GTK4.
- Added glib, libffi, pcre2 as build and runtime deps.
- This cascaded to Pango (which depends on HarfBuzz) getting new hashes automatically.

### ✅ Phase 4: GTK4-dependent libs

14. **gnome-autoar (0.4.5)** ✅
    - Recipe: `recipes/native/gnome-autoar/gnome-autoar.ts`
    - Recipe hash: `6123c49fa67ef518ba3d0b5d0e6b7ad7b1e50738eaf28211e160e2de81fd271d`
    - Output hash: `71dc0851f9797d33a98c5a728c5c5c3073534149101e745c518654dc5846f990`
    - Meson, `-Dgtk=false` (no GTK3 widgets)
    - Provides `libgnome-autoar-0.so` + `gnome-autoar-0.pc`

15. **libadwaita (1.7.12)** ✅
    - Recipe: `recipes/native/libadwaita/libadwaita.ts`
    - Recipe hash: `f6614c00c99e65b4991a7526d29c68e4bc8abd9ee41f93daeef63ceaa6e46c80`
    - Output hash: `28cb96170ccc12b46a3d67f8c5986c59746388b4568c150075e244fa528cbc55`
    - Meson, `-Dintrospection=disabled -Dvapi=false -Dtests=false -Dexamples=false -Ddocumentation=false`
    - Needed sassc as new build dep (built as `recipes/native/sassc/sassc.ts`)
    - Provides `libadwaita-1.so` + `libadwaita-1.pc`
    - Patched out `subdir('po')` (needs gettext, not needed for lib functionality)

16. **libportal-gtk4** ✅
    - Recipe: `recipes/native/libportal/libportal.ts` (updated)
    - Recipe hash: `fd1f3d749ea127c37698bdfc7bc8e112e1afc1677c7c016d0849afe8277639f3`
    - Output hash: `8570416f4c030cd90ee2d405cc316f52b6a1b4bda714d213608eb214748effc8`
    - Rebuilt with `-Dbackend-gtk4=enabled` + full GTK4 dep tree
    - Provides `libportal.so` + `libportal-gtk4.so` + `.pc` files

17. **sassc (3.6.2)** ✅ (new build tool, needed by libadwaita)
    - Recipe: `recipes/native/sassc/sassc.ts`
    - Builds libsass 3.6.5 as a static library, then sassc 3.6.2 against it
    - Only needs glibc at runtime (statically linked to libsass)

### Phase 5: Tracker/tinysparql ecosystem — IN PROGRESS

**New deps built:**

17a. **nghttp2 (1.69.0)** ✅ — autotools, `--enable-lib-only`, no deps beyond toolchain.
     - Recipe: `recipes/native/nghttp2/nghttp2.ts`

17b. **libidn2 (2.3.7)** ✅ — autotools, needs libunistring + libiconv (both built).
     - Recipe: `recipes/native/libidn2/libidn2.ts`

17c. **libpsl (0.21.5)** ✅ — autotools, needs libidn2 + python.
     - Recipe: `recipes/native/libpsl/libpsl.ts`

17. **libsoup3 (3.6.6)** ✅ — meson, needs glib + libxml2 + nghttp2 + libpsl + sqlite.
     - Recipe: `recipes/native/libsoup3/libsoup3.ts`
     - Built with `-Dtls_check=false` (glib-networking not needed at compile time)
     - Built with `-Dbrotli=disabled` (optional, not needed)
     - Patched out `subdir('po')` (needs gettext)

18. **tinysparql (3.9.2)** ✅ — provides `tracker-sparql-3.0`
    - Recipe: `recipes/native/tinysparql/tinysparql.ts`
    - Source: `https://download.gnome.org/sources/tinysparql/3.9/tinysparql-3.9.2.tar.xz`
    - Deps: glib, json-glib, libsoup3, libunistring, sqlite, dbus, libxml2
    - Built with `-Dunicode_support=unistring -Davahi=disabled -Dstemmer=disabled`
    - Patched out `cc.run()` checks (FTS5, strftime) using Python regex
    - Patched out `subdir('po')`, `subdir('fuzzing')`, `subdir('examples')`
    - Output hash: `40e3c0f5049b0c64c4b40c797e0cf057d783740cb8664939c8e860cf0474c609`

### Phase 6: GNOME desktop data packages ✅

19. **gsettings-desktop-schemas (48.0)** ✅ — data package, meson, just glib
    - Recipe: `recipes/native/gsettings-desktop-schemas/gsettings-desktop-schemas.ts`
    - Patched out `subdir('po')` and `gnome.post_install` (glib-compile-schemas done manually)
    - Provides `share/glib-2.0/schemas/*.gschema.xml` + `gdesktop-enums.h`

20. **xkeyboard-config (2.43)** ✅ — data package, meson, no deps beyond python
    - Recipe: `recipes/native/xkeyboard-config/xkeyboard-config.ts`
    - Patched out `subdir('po')` and xml2lst.lst generation (needs perl)
    - Provides `share/X11/xkb/` keyboard data + `xkeyboard-config.pc`
    - Needed python's full runtime dep chain for LD_LIBRARY_PATH (zlib, expat, etc.)

21. **iso-codes (4.18.0)** ✅ — data package, autotools, just python at build time
    - Recipe: `recipes/native/iso-codes/iso-codes.ts`
    - Provides `share/iso-codes/json/*.json` + `iso-codes.pc`

22. **gnome-desktop-4 (44.5)** ✅ — needs GTK4 + gsettings-desktop-schemas + libseccomp + xkeyboard-config + iso-codes
    - Recipe: `recipes/native/gnome-desktop/gnome-desktop.ts`
    - Meson options: `-Dbuild_gtk4=true -Dlegacy_library=false -Dudev=disabled -Dsystemd=disabled`
    - Provides `libgnome-desktop-4.so`, `libgnome-bg-4.so`, `libgnome-rr-4.so` + `.pc` files
    - Patched out `subdir('po')`, `subdir('tests')`, fixed introspection-disabled empty GIR bug

### Phase 7: Nautilus! ❌

23. **nautilus (48.7)**
    - Source: `https://download.gnome.org/sources/nautilus/48/nautilus-48.7.tar.xz`
    - Meson options: `-Dextensions=false -Dselinux=false -Dcloudproviders=false -Dpackagekit=false -Ddocs=false -Dtests=none -Dintrospection=disabled`

---

## 7. Dependency Tree Status

```
Level 0 (already built):
  ✅ glib (2.82.5), pango (1.56.4), cairo (1.18.4), harfbuzz (10.2.0, with GLib integration)
  ✅ fontconfig, freetype, fribidi, libpng, pixman, zlib, expat, bzip2
  ✅ libffi, pcre2, libxml2, libiconv, xz, zstd
  ✅ libepoxy, at-spi2-core, shared-mime-info
  ✅ all X11 libs, wayland (1.25.0), wayland-protocols (1.48)
  ✅ libxkbcommon, dbus, python, meson, ninja, sqlite
  ✅ curl (8.20.0), openssl
  ✅ libdrm (2.4.124)

Level 1 (new leaf packages — this session):
  ✅ graphene (1.10.8)
  ✅ libarchive (3.7.7)
  ✅ libportal (0.9.0) — core only, no GTK4 backend yet
  ✅ json-glib (1.10.0)
  ✅ libseccomp (2.5.5)
  ✅ xmlb (0.3.21)
  ✅ libfyaml (0.9.6)
  ✅ libunistring (1.3)

Level 2 (image libs + appstream — this session):
  ✅ libjpeg (IJG 9e)
  ✅ libtiff (4.7.0)
  ✅ gdk-pixbuf (rebuilt with JPEG/TIFF)
  ✅ appstream (1.1.2)

Level 3:
  ✅ GTK4 (4.18.6) — X11 backend only, EGL stubbed out, profile_conf.h pre-generated

Level 4:
  ✅ gnome-autoar (0.4.5)         — glib ✅ + libarchive ✅
  ✅ libadwaita (1.7.12)          — GTK4 ✅ + appstream ✅ + fribidi ✅
  ✅ libportal-gtk4              — GTK4 ✅ + libportal ✅
  ✅ sassc (3.6.2)               — build tool needed by libadwaita

Level 5:
  ✅ libsoup3 (3.6.6)
  ✅ tinysparql (3.9.2)         — json-glib + libsoup3 + libunistring + sqlite + dbus

Level 6:
  ✅ gsettings-desktop-schemas (48.0) — data, just glib
  ✅ xkeyboard-config (2.43)   — data, python for build
  ✅ iso-codes (4.18.0)        — data, python for build
  ✅ gnome-desktop-4 (44.5)    — GTK4 + schemas + libseccomp + xkb-config + iso-codes

Level 7:
  ❌ nautilus (48.7)            — needs all of the above
```

---

## 8. Highest-Risk Items Remaining

1. **GTK4 build** — massive package, many meson `cc.run()` checks that may fail in sandbox. The `cc.run()` for Pango/fontconfig has historically been tricky. Also needs CXX for C++ code.
2. **tinysparql** — `cc.run()` checks for sqlite FTS5 and strftime. Known to fail in sandboxed builds.
3. **libsoup3** — dep tree not fully researched. May need libnghttp2, libpsl, brotli.
4. **gnome-desktop-4** — pulls in data packages (gsettings-desktop-schemas, xkeyboard-config, iso-codes).

---

## 9. How to Build and Test

```bash
cd /home/crussell/hod
export PATH="$PWD/target/debug:$PATH"
BUN=/nix/store/vmhlm86h4c9gxzrczqd91hwfz2kkfn25-bun-1.3.11/bin/bun

# Import + build a package:
$BUN run recipes/native/<pkg>/<pkg>-source.ts
$BUN run recipes/native/<pkg>/<pkg>.ts
HASH=$($BUN -e "
import { <Pkg>Recipe } from './recipes/native/<pkg>/<pkg>.js';
console.log(<Pkg>Recipe.hash);
" 2>&1 | tail -1)
hod build --hash $HASH

# Verify:
hod ls-output -r <output-hash>
```

---

## 10. Potential Improvements Noticed

1. **`cProfile()` should have an option for CXX/CPP** — Many packages need C++ support. Currently every recipe that needs C++ must manually set `export CXX=...`. A `cProfile({ cxx: true })` option would eliminate this boilerplate.

2. **`mesonProfile()` should handle `LD_LIBRARY_PATH` + `rpath-link` automatically** — Almost every meson build needs both for configure-time test programs and for linking against transitive shared deps. The helper could auto-generate these from the declared dep list.

3. **Stale output caching** — When a source recipe's `strip_components` is changed but the tarball hash is the same, the old (wrong) output is served from cache. Had to manually delete from the `outputs` SQLite table to force re-extraction. A `hod rebuild --force` command would help.

4. **fetchTarball should auto-detect `strip_components`** — Tarballs with `./Package-Version/` structure need `strip_components: 2`. The system could detect this by examining the first entry of the tarball.
