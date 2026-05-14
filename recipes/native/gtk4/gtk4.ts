//! GTK4 build recipe — GTK 4 graphical toolkit.
//!
//! Builds GTK 4.18.6 with X11 backend enabled, Wayland/Broadway disabled.
//! Uses Meson build system. All major dependencies built from source via Hod.
//! Required by libadwaita and modern GNOME applications like Nautilus.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { gtk4SourceRecipe } from "./gtk4-source.js";
import { glibRecipe } from "../glib/glib.js";
import { pangoRecipe } from "../pango/pango.js";
import { cairoRecipe } from "../cairo/cairo.js";
import { gdkPixbufRecipe } from "../gdk-pixbuf/gdk-pixbuf.js";
import { libepoxyRecipe } from "../libepoxy/libepoxy.js";
import { grapheneRecipe } from "../graphene/graphene.js";
import { atSpi2CoreRecipe } from "../at-spi2-core/at-spi2-core.js";
import { sharedMimeInfoRecipe } from "../shared-mime-info/shared-mime-info.js";
import { harfbuzzRecipe } from "../harfbuzz/harfbuzz.js";
import { fontconfigRecipe } from "../fontconfig/fontconfig.js";
import { freetypeRecipe } from "../freetype/freetype.js";
import { fribidiRecipe } from "../fribidi/fribidi.js";
import { libpngRecipe } from "../libpng/libpng.js";
import { pixmanRecipe } from "../pixman/pixman.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { expatRecipe } from "../expat/expat.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { libX11Recipe } from "../libX11/libX11.js";
import { libXextRecipe } from "../libXext/libXext.js";
import { libXrenderRecipe } from "../libXrender/libXrender.js";
import { libXiRecipe } from "../libXi/libXi.js";
import { libXrandrRecipe } from "../libXrandr/libXrandr.js";
import { libXcursorRecipe } from "../libXcursor/libXcursor.js";
import { libXineramaRecipe } from "../libXinerama/libXinerama.js";
import { libXdamageRecipe } from "../libXdamage/libXdamage.js";
import { libXcompositeRecipe } from "../libXcomposite/libXcomposite.js";
import { libXfixesRecipe } from "../libXfixes/libXfixes.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { dbusRecipe } from "../dbus/dbus.js";
import { libxml2Recipe } from "../libxml2/libxml2.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { xzRecipe } from "../xz/xz.js";
import { libXtstRecipe } from "../libXtst/libXtst.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { waylandRecipe } from "../wayland/wayland.js";
import { waylandProtocolsRecipe } from "../wayland-protocols/wayland-protocols.js";
import { libxkbcommonRecipe } from "../libxkbcommon/libxkbcommon.js";
import { libjpegRecipe } from "../libjpeg/libjpeg.js";
import { libtiffRecipe } from "../libtiff/libtiff.js";
import { zstdRecipe } from "../zstd/zstd.js";
import { libdrmRecipe } from "../libdrm/libdrm.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL } from "../../helpers/strip.js";

// Transitive runtime deps: GTK4 needs all shared libs in its dependency chain.
export const gtk4RuntimeDeps = [
  "at-spi2-core", "bzip2", "cairo", "dbus", "expat", "fontconfig",
  "freetype", "fribidi", "gdk-pixbuf", "glib", "graphene", "harfbuzz",
  "libX11", "libXau", "libXcb", "libXcomposite", "libXcursor",
  "libXdamage", "libXdmcp", "libXext", "libXfixes", "libXi",
  "libXinerama", "libXrandr", "libXrender", "libXtst", "libdrm",
  "libepoxy", "libffi", "libiconv", "libjpeg", "libpng", "libtiff",
  "libxml2", "pango", "pcre2", "pixman", "shared-mime-info",
  "toolchain", "wayland", "xz", "zlib", "zstd",
];

// All deps that provide shared libs — used for LD_LIBRARY_PATH and rpath-link.
const libDepNames = [
  "glib", "pango", "cairo", "gdk-pixbuf", "libepoxy", "graphene",
  "at-spi2-core", "dbus", "harfbuzz", "fontconfig", "freetype",
  "fribidi", "libpng", "pixman", "zlib", "expat", "bzip2", "libffi",
  "pcre2", "libX11", "libXext", "libXrender", "libXi", "libXrandr",
  "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
  "libXfixes", "libXau", "libXcb", "libXdmcp", "libxml2", "libiconv",
  "xz", "libXtst", "wayland", "libdrm", "libjpeg", "libtiff", "zstd",
];

// Generate LD_LIBRARY_PATH from lib deps
const ldLibraryPath = libDepNames.map((d) => `/deps/${d}/lib`).join(":");

// Generate rpath-link flags from lib deps
const rpathLinkFlags = libDepNames.map((d) => `-Wl,-rpath-link,/deps/${d}/lib`).join(" \\\n  ");

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    binDeps: ["glib", "gdk-pixbuf", "shared-mime-info"],
    includeDeps: [
      "glib", "pango", "cairo", "gdk-pixbuf", "libepoxy", "graphene",
      "at-spi2-core", "dbus",
      "harfbuzz", "fontconfig", "freetype", "fribidi", "libpng", "pixman",
      "zlib", "expat", "bzip2", "libffi", "pcre2",
      "libX11", "libXext", "libXrender", "libXi", "libXrandr",
      "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
      "libXfixes", "libXau", "libXcb", "libXdmcp", "xorgproto",
      "libxml2", "libiconv", "xz", "libXtst", "wayland",
      "libxkbcommon", "libdrm", "libjpeg", "libtiff", "zstd",
    ],
    includePaths: ["/deps/freetype/include/freetype2"],
    libDeps: [
      "glib", "pango", "cairo", "gdk-pixbuf", "libepoxy", "graphene",
      "at-spi2-core", "dbus",
      "harfbuzz", "fontconfig", "freetype", "fribidi", "libpng", "pixman",
      "zlib", "expat", "bzip2", "libffi", "pcre2",
      "libX11", "libXext", "libXrender", "libXi", "libXrandr",
      "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
      "libXfixes", "libXau", "libXcb", "libXdmcp",
      "libxml2", "libiconv", "xz", "libXtst", "wayland",
      "libxkbcommon", "libdrm", "libjpeg", "libtiff", "zstd",
    ],
    pkgConfigDeps: [
      "glib", "pango", "cairo", "gdk-pixbuf", "libepoxy", "graphene",
      "at-spi2-core", "dbus",
      "harfbuzz", "fontconfig", "freetype", "fribidi", "libpng", "pixman",
      "zlib", "expat", "bzip2", "libffi", "pcre2",
      "libX11", "libXext", "libXrender", "libXi", "libXrandr",
      "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
      "libXfixes", "libXau", "libXcb", "libXdmcp",
      "libxml2", "libXtst", "xz", "wayland",
      "libxkbcommon", "libdrm", "libjpeg", "libtiff", "zstd",
    ],
    // TODO: pkgConfigPaths no longer needed — cProfile() now auto-includes
    // both lib/pkgconfig and share/pkgconfig for each pkgConfigDeps entry.
    // Add "xorgproto", "shared-mime-info" to pkgConfigDeps and remove this block.
    pkgConfigPaths: [
      "/deps/xorgproto/share/pkgconfig",
      "/deps/shared-mime-info/share/pkgconfig",
    ],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# Pre-generate profile_conf.h and patch meson.build to avoid the
# capture: true custom_target that triggers meson --internal exe.
mkdir -p build
printf '/* Auto-generated. */\n#pragma once\n#define PROFILE "default"\n#define VCS_TAG ""\n' > build/profile_conf.h

# Patch meson.build to replace profile_conf custom_target with static file
/deps/python/bin/python3 -c "
content = open('meson.build').read()
old = '''profile_conf_h = declare_dependency(
  sources: custom_target('profile-conf',
    command: [gen_profile_conf, meson.project_source_root(), profile],
    capture: true,
    output: 'profile_conf.h',
    build_by_default: true,
    build_always_stale: true,
  )
)'''
new = '''profile_conf_h = declare_dependency(
  sources: files('build/profile_conf.h'),
)'''
content = content.replace(old, new)
open('meson.build', 'w').write(content)
"

# Patch gdk/x11/meson.build to remove EGL context source
sed -i "/gdkglcontext-egl.c/d" gdk/x11/meson.build

# Patch inspector to not call EGL functions at runtime
sed -i 's/eglQueryString(dpy, EGL_VERSION)/"(no egl)"/' gtk/inspector/general.c
sed -i 's/eglQueryString(dpy, EGL_VENDOR)/"(no egl)"/' gtk/inspector/general.c

# Create stub implementations for EGL functions and types that GTK4's
# X11 backend references unconditionally. These return safe defaults.
cat > /tmp/egl-stub.c << 'STUBEOF'
#include <stddef.h>
typedef void* EGLDisplay;
typedef void* EGLConfig;
typedef int EGLint;
typedef unsigned int EGLBoolean;
typedef void* gpointer;
typedef unsigned long gsize;
#define EGL_FALSE 0
#define EGL_NO_DISPLAY ((EGLDisplay)0)
EGLBoolean eglGetConfigAttrib(EGLDisplay d, EGLConfig c, EGLint a, EGLint* v) { *v = 0; return EGL_FALSE; }
const char* eglQueryString(EGLDisplay d, EGLint n) { return NULL; }
EGLDisplay eglGetDisplay(void* d) { return EGL_NO_DISPLAY; }
EGLDisplay eglGetPlatformDisplay(unsigned int p, void* d, const EGLint* a) { return EGL_NO_DISPLAY; }
EGLBoolean eglInitialize(EGLDisplay d, EGLint* a, EGLint* b) { return EGL_FALSE; }
int epoxy_egl_version(void) { return 0; }
/* GTK4 EGL context stubs */
gpointer gdk_x11_display_get_egl_display(gpointer display) { return NULL; }
int gdk_display_init_egl(gpointer display) { return 0; }
gpointer gdk_display_get_egl_config(gpointer display) { return NULL; }
gsize gdk_x11_gl_context_egl_get_type(void) { return 0; }
STUBEOF
/deps/toolchain/bin/gcc -c -O2 /tmp/egl-stub.c -o /tmp/egl-stub.o
/deps/toolchain/bin/ar rcs /tmp/libegl-stub.a /tmp/egl-stub.o

# Add the EGL stub source to the gdk-x11 static library so meson compiles and links it.
cp /tmp/egl-stub.c gdk/x11/egl-stub.c
# Use a broader sed pattern to add egl-stub.c to the sources list
sed -i "/gdk_x11_sources/s/\]/, files('egl-stub.c') ]/" gdk/x11/meson.build
# Verify
grep egl-stub gdk/x11/meson.build || echo 'WARNING: egl-stub not found in gdk/x11/meson.build'

# Provide EGL headers for compilation. GTK4's X11 backend uses EGL types
# unconditionally even when HAVE_EGL is not set. We provide minimal stubs.
mkdir -p /tmp/egl-stub/EGL /tmp/egl-stub/epoxy
cat > /tmp/egl-stub/EGL/egl.h << 'EGLEOF'
#ifndef EGL_EGL_H
#define EGL_EGL_H
#include <stdint.h>
typedef void* EGLDisplay;
typedef void* EGLConfig;
typedef void* EGLSurface;
typedef void* EGLContext;
typedef int32_t EGLint;
typedef uint32_t EGLenum;
typedef void* EGLClientBuffer;
typedef unsigned int EGLBoolean;
#define EGL_NO_DISPLAY ((EGLDisplay)0)
#define EGL_NO_SURFACE ((EGLSurface)0)
#define EGL_NO_CONTEXT ((EGLContext)0)
#define EGL_FALSE 0
#define EGL_TRUE 1
#define EGL_SUCCESS 0x3000
#define EGL_NATIVE_VISUAL_ID 0x302E
#define EGL_EXTENSIONS 0x3055
#define EGL_VERSION 0x3054
#define EGL_VENDOR 0x3053
#define EGL_PLATFORM_X11_KHR 0x31D5
#define EGL_PLATFORM_X11_SCREEN_KHR 0x31D6
extern EGLDisplay eglGetDisplay(void*);
extern EGLDisplay eglGetPlatformDisplay(EGLenum, void*, const EGLint*);
extern EGLBoolean eglInitialize(EGLDisplay, EGLint*, EGLint*);
extern const char* eglQueryString(EGLDisplay, EGLint);
extern EGLBoolean eglGetConfigAttrib(EGLDisplay, EGLConfig, EGLint, EGLint*);
#endif
EGLEOF
cat > /tmp/egl-stub/epoxy/egl.h << 'EPOXYEOF'
#ifndef EPOXY_EGL_H
#define EPOXY_EGL_H
#include <EGL/egl.h>
#endif
EPOXYEOF

export CFLAGS="$CFLAGS -I/tmp/egl-stub"
export CXXFLAGS="$CXXFLAGS -I/tmp/egl-stub"

# C++ compiler — GTK4 has C++ code
export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export CXXFLAGS="-O2 -I/deps/freetype/include/freetype2"

# Ensure shared libs can be found by meson's cc.run() checks and at link time
export LD_LIBRARY_PATH="${ldLibraryPath}\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"

export LDFLAGS="$HOD_DUMMY_RPATH \\
  ${rpathLinkFlags}"

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddefault_library=shared \\
  -Dx11-backend=true \\
  -Dwayland-backend=false \\
  -Dbroadway-backend=false \\
  -Dvulkan=disabled \\
  -Dmedia-gstreamer=disabled \\
  -Dintrospection=disabled \\
  -Dbuild-demos=false \\
  -Dbuild-tests=false \\
  -Dbuild-testsuite=false \\
  -Dbuild-examples=false \\
  -Dprint-cpdb=disabled \\
  -Dprint-cups=disabled \\
  -Dcloudproviders=disabled \\
  -Dcolord=disabled \\
  -Dsysprof=disabled \\
  -Dtracker=disabled \\
  -Df16c=disabled \\
  -Daccesskit=disabled \\
  -Ddocumentation=false \\
  -Dman-pages=false

ninja -C build
DESTDIR=$OUT ninja -C build install

# Make pkg-config files relocatable
for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\\\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\\\${pcfiledir}/../..|' "$pc" ;;
  esac
done

${STRIP_ALL}
`,
  deps: [
    dep("source", gtk4SourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("glib", glibRecipe),
    dep("pango", pangoRecipe),
    dep("cairo", cairoRecipe),
    dep("gdk-pixbuf", gdkPixbufRecipe),
    dep("libepoxy", libepoxyRecipe),
    dep("graphene", grapheneRecipe),
    dep("at-spi2-core", atSpi2CoreRecipe),
    dep("shared-mime-info", sharedMimeInfoRecipe),
    dep("harfbuzz", harfbuzzRecipe),
    dep("fontconfig", fontconfigRecipe),
    dep("freetype", freetypeRecipe),
    dep("fribidi", fribidiRecipe),
    dep("libpng", libpngRecipe),
    dep("pixman", pixmanRecipe),
    dep("zlib", zlibRecipe),
    dep("expat", expatRecipe),
    dep("bzip2", bzip2Recipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("libX11", libX11Recipe),
    dep("libXext", libXextRecipe),
    dep("libXrender", libXrenderRecipe),
    dep("libXi", libXiRecipe),
    dep("libXrandr", libXrandrRecipe),
    dep("libXcursor", libXcursorRecipe),
    dep("libXinerama", libXineramaRecipe),
    dep("libXdamage", libXdamageRecipe),
    dep("libXcomposite", libXcompositeRecipe),
    dep("libXfixes", libXfixesRecipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("dbus", dbusRecipe),
    dep("libxml2", libxml2Recipe),
    dep("libiconv", libiconvRecipe),
    dep("xz", xzRecipe),
    dep("libXtst", libXtstRecipe),
    dep("wayland", waylandRecipe),
    dep("wayland-protocols", waylandProtocolsRecipe),
    dep("libxkbcommon", libxkbcommonRecipe),
    dep("libjpeg", libjpegRecipe),
    dep("libtiff", libtiffRecipe),
    dep("zstd", zstdRecipe),
    dep("libdrm", libdrmRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: gtk4RuntimeDeps,
});

await importToStore(recipe);
export const gtk4Recipe = recipe;
