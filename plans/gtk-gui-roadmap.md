# GTK GUI App Roadmap

**Status:** Active, but partially historical  
**Current milestone:** Hod has now built and transferred Geany successfully to another machine.  
**Current authority:** `recipes/native/geany/geany.ts`, `plans/geany-wrapper-handoff.md`, `docs/closure-transfer.md`, `docs/relocatable-binaries-guide.md`

**Goal:** Build and run GTK graphical applications entirely from source using Hod's hermetic build system, with all dependencies in the content-addressed store.

**First milestone:** A minimal X11 "Hello Hod" window (Phase 1A).

**Final milestone:** `yad` displaying a GTK dialog (Phase 2).

## Architecture Decisions

### Why GTK3 (not GTK4, not Qt)

- GTK3 can be built **without OpenGL/Mesa** (GTK4 requires libepoxy + EGL/GL).
- GTK3 still uses autotools in its latest release (3.24.x). GTK4 requires Meson.
- Pure C — no C++ runtime complexity.
- Well-documented autotools builds for all X11 libraries.

### Why not avoid Meson entirely?

GLib (≥ 2.62) requires Meson. We need current GLib for security and
compatibility. Two options were considered:

1. **Use old GLib 2.60** (last autotools version, from 2019) — avoids Meson but
   pins us to an ancient library with known bugs.
2. **Build Meson from source** — one extra package, unlocks current GLib,
   Pango, HarfBuzz, Cairo, etc.

**Decision: Build Meson.** It's a pure-Python program; we already have Python.
One package gives us access to the entire modern GNOME build stack.

### Meson installation approach

Our Python is built `--without-ensurepip` (no pip). Meson is designed to run
directly from an extracted source tarball:

```
python3 /deps/meson-source/meson.py setup builddir
```

We create a `meson` recipe that:
1. Downloads Meson source tarball (hash-verified)
2. Copies `mesonbuild/` Python package into `$OUT/lib/pythonX.Y/site-packages/`
3. Creates `$OUT/bin/meson` shell wrapper that sets PYTHONPATH and runs
   `python3 -m mesonbuild.mesonmain "$@"`

This gives us a reusable `dep("meson", mesonRecipe)` for any Meson-based build.

### Ninja

Meson generates Ninja build files by default. Ninja is a small C++ program
(~50 source files). We build it from source with our C++ compiler (gcc-stage2-c
is in the toolchain). Alternative: Meson supports `--backend=make`, but Ninja
is the standard and more reliable backend.

### runtime_deps strategy

Each library recipe exports its transitive `runtime_deps` as a TypeScript array.
Downstream recipes use JavaScript spread to compose them:

```typescript
// libxcb.ts
export const libxcbRuntimeDeps = ["toolchain", "libXau", "libXdmcp"];

// libX11.ts
import { libxcbRuntimeDeps } from "../libxcb/libxcb.js";
export const libX11RuntimeDeps = [...libxcbRuntimeDeps, "libxcb"];

// hello-x11.ts (app)
import { libX11RuntimeDeps } from "../libX11/libX11.js";
runtime_deps: [...libX11RuntimeDeps, "libX11"]
```

Each level adds only its direct deps. Spread naturally deduplicates.
Recipes that don't produce shared libraries (headers-only, data-only) skip
exporting a runtime deps array.

### Build profile helper: mesonProfile()

Analogous to `cProfile()` in `recipes/helpers/c.ts`. Provides:
- Everything from `cProfile()`
- `MESON` env var pointing at `/deps/meson/bin/meson`
- `NINJA` env var pointing at `/deps/ninja/bin/ninja`
- Adds meson and ninja deps/bin to PATH

Usage:
```typescript
import { mesonProfile } from "../helpers/meson.js";
shellBuild({
  ...mesonProfile(),
  deps: [dep("source", src), dep("toolchain", tc), dep("meson", mesonRecipe), dep("ninja", ninjaRecipe)],
  script: `
    meson setup builddir --prefix=/ ${mesonFlags}
    ninja -C builddir
    DESTDIR=$OUT ninja -C builddir install
  `,
});
```

---

## Phase 0: Build Tools

### 0.1 Ninja

- [x] **ninja** — Ninja build system 1.13.2 (github.com/ninja-build/ninja).
  Small C++ program. Built from source with direct g++ compilation
  (no configure.py --bootstrap). Deps: toolchain + python.
  `shellBuild` with custom script. `runtime_deps: ["toolchain"]`.

### 0.2 Meson

- [x] **meson** — Meson build system 1.8.0 (github.com/mesonbuild/meson).
  Pure-Python. Installed as source with bin/meson wrapper that invokes python3.
  Deps: toolchain + python + zlib. `shellBuild`.

### 0.3 Meson Profile Helper

- [x] **mesonProfile()** in `recipes/helpers/meson.ts` — build profile helper
  for Meson-based packages. Extends cProfile() with MESON, NINJA env vars,
  PATH additions for meson/ninja bins.

---

## Phase 1A: Minimal X11 + Hello Window

The X11 protocol binding chain. All are small autotools builds.
Once libX11 exists, we compile a 20-line C "Hello Hod" X11 app.

### X11 Protocol Chain

- [x] **xorgproto** — X11 protocol headers 2024.1 (xorg.freedesktop.org).
  Headers only (no library). autotools. Deps: toolchain. No runtime_deps.

- [x] **libXau** — X Authorization library 1.0.12. Tiny. autotools.
  Deps: toolchain + xorgproto. `runtime_deps: ["toolchain"]`.

- [x] **libXdmcp** — X Display Manager Control Protocol 1.1.5. Tiny. autotools.
  Deps: toolchain + xorgproto. `runtime_deps: ["toolchain"]`.

- [x] **xcb-proto** — XCB protocol XML descriptions 1.17.0. Data files only.
  autotools. Deps: toolchain + python. No runtime_deps.

- [x] **libpthread-stubs** — pthread stubs for non-pthread platforms 0.5.
  Tiny. autotools. Deps: toolchain. No shared lib (static/empty on Linux).

- [x] **xtrans** — X transport headers 1.6.0. Header/data package required by
  libX11. autotools. Deps: toolchain. No runtime_deps.

- [x] **libxcb** — X C Binding 1.17.0. autotools. Needs Python + expat at build
  time to generate code from xcb-proto XML. Deps: toolchain + xcb-proto +
  libXau + libXdmcp + libpthread-stubs + python + expat.
  `runtime_deps: ["libXau", "libXdmcp", "toolchain"]`.

- [x] **libX11** — X11 client library 1.8.11. autotools.
  Deps: toolchain + xorgproto + xtrans + libxcb + libXau + libXdmcp.
  `runtime_deps: ["libXau", "libXcb", "libXdmcp", "toolchain"]`.

### First GUI App

- [x] **hello-x11** — Minimal X11 "Hello Hod" window.
  Inline C source (~20 lines) compiled with shellBuild.
  Opens a 400x300 X11 window and draws "Hello Hod!" text.
  Deps: toolchain + libX11 + xorgproto.
  `runtime_deps: [...libX11RuntimeDeps, "libX11"]`.

  **This is the first graphical proof-of-concept.**

---

## Phase 1B: X11 Extension Libraries

Additional X11 extensions needed by GTK3's X11 backend.

- [x] **libXext** — X11 miscellaneous extensions 1.3.6. autotools.
  Deps: toolchain + xorgproto + libX11. Built shared with pkg-config metadata.

- [x] **libXfixes** — X11 miscellaneous 'fixes' extension 6.0.1. autotools.
  Deps: toolchain + xorgproto + libX11. Built shared with pkg-config metadata.

- [x] **libXrender** — X Rendering extension 0.9.12. autotools.
  Deps: toolchain + xorgproto + libX11. Built shared with pkg-config metadata.

- [x] **libXi** — X Input extension 1.8.2. autotools.
  Deps: toolchain + xorgproto + libX11 + libXext + libXfixes.
  Built shared with pkg-config metadata.

- [x] **libXrandr** — X Resize and Rotate extension 1.5.4. autotools.
  Deps: toolchain + xorgproto + libX11 + libXext + libXrender.
  Built shared with pkg-config metadata.

- [x] **libXcursor** — X cursor management 1.2.2. autotools.
  Deps: toolchain + xorgproto + libX11 + libXrender + libXfixes.
  Built shared with pkg-config metadata.

- [x] **libXinerama** — X Xinerama extension 1.1.5. autotools.
  Deps: toolchain + xorgproto + libX11 + libXext. Built shared with pkg-config metadata.

- [x] **libXdamage** — X Damage extension 1.1.6. autotools.
  Deps: toolchain + xorgproto + libX11 + libXfixes.
  Built shared with pkg-config metadata.

- [x] **libXcomposite** — X Composite extension 0.4.6. autotools.
  Deps: toolchain + xorgproto + libX11 + libXfixes.
  Built shared with pkg-config metadata.

- [x] **libXtst** — X Test extension 1.2.5. autotools.
  Required by at-spi2-core. Deps: toolchain + xorgproto + libX11 + libXext.
  Built shared with pkg-config metadata.

---

## Phase 1C: Foundation Libraries

Image loading, font rendering, and text shaping. These are the non-GUI-specific
libraries that GTK depends on.

- [x] **libpng** — PNG image library 1.6.47. autotools.
  Deps: toolchain + zlib. Built shared with pkg-config metadata.

- [x] **freetype** — Font rendering 2.13.3. autotools.
  Deps: toolchain + zlib + libpng + bzip2. Built shared with pkg-config metadata.

- [x] **gperf** — perfect hash generator 3.3. autotools.
  Build-time helper added because fontconfig regenerates generated hash tables.

- [x] **fontconfig** — Font discovery/naming 2.16.0. autotools.
  Deps: toolchain + freetype + expat + python + gperf. Built shared with CLI tools and pkg-config metadata.

- [x] **harfbuzz** — Text shaping 10.2.0. Meson.
  Deps: toolchain + freetype + meson + ninja + python. Built shared with FreeType support and without GLib/ICU/Cairo for this stage.

- [x] **glib** — GLib core library 2.82.5. Meson.
  Deps: toolchain + libffi + pcre2 + zlib + meson + ninja + python; expat is mounted for Python's XML module at build time.
  Built shared with selinux/libmount/introspection/docs/tests disabled for the first GTK3 stack pass.

---

## Phase 1D: Graphics and Text Stack

These depend on the Phase 1C libraries and provide the drawing/text rendering
that GTK uses.

- [x] **pixman** — Pixel manipulation library 0.46.4. Meson.
  Added during implementation because Cairo requires `pixman-1`.

- [x] **cairo** — 2D vector graphics 1.18.4. Meson.
  Xlib surface backend needed for GTK3. Deps: toolchain + pixman + freetype +
  fontconfig + libpng + glib + libX11 + libXext + libXrender + meson + ninja.
  Note: Cairo's generated `cairo-ft.pc` needed a Fontconfig `Requires` fix.

- [x] **fribidi** — Unicode bidirectional text library 1.0.16. Meson.
  Added during implementation because Pango requires FriBidi.

- [x] **pango** — Text layout/rendering 1.56.4. Meson.
  Deps: toolchain + glib + harfbuzz + cairo + fontconfig + freetype + fribidi + meson + ninja.

- [x] **gdk-pixbuf** — Image loading 2.42.12. Meson.
  Deps: toolchain + glib + libpng + meson + ninja. Built with PNG/GIF loaders and without JPEG/TIFF for the first pass.

- [x] **atk** — Accessibility toolkit 2.38.0. Meson.
  Deps: toolchain + glib + meson + ninja.

- [x] **shared-mime-info** — Shared MIME database 2.4. Meson.
  Deps: toolchain + glib + libxml2. Built data plus `update-mime-database`; translations were disabled and the untranslated XML template is installed directly to avoid a gettext/msgfmt dependency.

- [x] **libepoxy** — OpenGL function pointer management 1.5.10. Meson.
  Required by GTK3. Built with GLX/X11 support and EGL disabled. Deps: toolchain + meson + ninja + python + expat + xorgproto + libX11.

- [x] **dbus** — D-Bus message bus 1.16.2. Meson.
  Required by at-spi2-core. Built as library only (no daemon/tools).
  Deps: toolchain + expat + meson + ninja + python.

- [x] **at-spi2-core** — Accessibility service core 2.54.1. Meson.
  Provides both ATK 2.54.1 and atk-bridge. Subsumes standalone atk.
  GTK3 uses this instead of standalone atk 2.38.0 to avoid ATK symbol
  version mismatches with libatk-bridge.
  Deps: toolchain + glib + dbus + libX11 + libXtst + xorgproto + meson + ninja + python.

---

## Phase 2: GTK3 and First App

- [x] **gtk3** — GTK+ 3 toolkit 3.24.49. Meson.
  Configure flags: `-Dx11_backend=true -Dwayland_backend=false
  -Dbroadway_backend=false`. Deps: toolchain + glib + pango + cairo +
  gdk-pixbuf + at-spi2-core (provides ATK) + libepoxy + shared-mime-info +
  all X11 libs + dbus + meson + ninja + python.
  `runtime_deps`: all transitive shared libs in the dependency chain
  (see `gtk3RuntimeDeps` in `gtk3.ts`).

  Note: GTK 3.24.49 uses Meson (not autotools). ATK is provided by
  at-spi2-core 2.54.1 rather than standalone atk 2.38.0, since
  libatk-bridge from at-spi2-core requires ATK ≥ 2.54.

- [x] **yad** — Yet Another Dialog 14.2 (github.com/v1cont/yad).
  GTK3 dialog tool. autotools. Deps: toolchain + gtk3 + all transitive deps.
  Built standalone (--enable-standalone) without gsettings/schema compilation.
  NLS, spell, sourceview, html, icon-browser, and tools all disabled.
  `runtime_deps: [...gtk3RuntimeDeps, "gtk3"].sort()`.

---

## Phase 3: Runtime Experience (Future)

These tasks make GUI apps actually *run* from the store on a desktop:

- [ ] **hod profile env**: Extend profile env.sh to emit GTK-specific runtime
  variables (`GDK_PIXBUF_MODULEDIR`, `GI_TYPELIB_PATH`, `XDG_DATA_DIRS`,
  `GSETTINGS_SCHEMA_DIR`, `FONTCONFIG_PATH`).

- [ ] **hod run / hod shell**: Pass through display-related env vars from host:
  `DISPLAY`, `WAYLAND_DISPLAY`, `XAUTHORITY`, `XCURSOR_PATH`.
  Optionally mount `/tmp/.X11-unix` or `$XDG_RUNTIME_DIR/wayland-*` into
  the execution environment.

- [ ] **GTK schemas compilation**: Add a post-build step for GTK apps that
  compiles GSettings schemas into the output directory.

---

## Summary by Numbers

| Phase | Packages | Build System | Cumulative |
|-------|----------|-------------|------------|
| 0: Build tools | 2 (ninja, meson) + 1 helper | C++, Python | 3 |
| 1A: Minimal X11 | 7 + hello app | all autotools | 11 |
| 1B: X11 extensions | 10 (+ libXtst) | all autotools | 21 |
| 1C: Foundation libs | 5 | mix autotools + meson | 26 |
| 1D: Graphics stack | 9 (+ dbus, at-spi2-core, previously counted atk) | mostly meson | 35 |
| 2: GTK3 + yad | 2 | meson + autotools | 37 |

**37 new packages** to get from "CLI only" to "GTK3 dialog on screen".

Most X11 libs are trivial builds (configure + make, ~10 lines of recipe).
The Meson-based builds (GLib, HarfBuzz, Pango, Cairo, etc.) are more complex
but follow a consistent pattern once the profile helper exists.

## Dependency Graph (Simplified)

```
xorgproto ─────────────────────────────────────────────────────┐
libXau ──┐                                                      │
libXdmcp ├── libxcb ── libX11 ── libXext ──────────────────────┤
         │                ├── libXrender ── libXrandr ──────────┤
         │                ├── libXfixes ── libXi ───────────────┤
         │                │            ├── libXdamage ──────────┤
         │                │            ├── libXcomposite ───────┤
         │                │            └── libXcursor ──────────┤
         │                └── libXinerama ─────────────────────┤
                                                                │
zlib ── libpng ── freetype ── fontconfig ─────────────────────┤
                  │            │                                │
                  │            └── harfbuzz ───────────────────┤
                  │                                             │
libffi ── glib ── cairo ── pango ──────────────────────────────┤
pcre2 ──┘       │        │                                     │
         gdk-pixbuf      │                                     │
         at-spi2-core   │                                     │
         libepoxy        │                                     │
                  │      │                                     │
                  └──────┴─── GTK3 ── yad ◄─────────────────────┘
```
