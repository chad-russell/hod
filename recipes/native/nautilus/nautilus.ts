//! nautilus build recipe — GNOME Files file manager.
//!
//! Builds Nautilus 48.7. The default GNOME file manager, built with GTK4
//! and libadwaita. This is the capstone "Tier 4" package that exercises
//! the full GTK4/libadwaita GUI pipeline.
//!
//! Dependencies: GTK4, libadwaita, gnome-desktop-4, gnome-autoar,
//! tinysparql (tracker-sparql-3.0), libportal-gtk4, libsoup3, glib.
//!
//! Build approach:
//! - Extensions disabled (avoids gexiv2, gstreamer deps)
//! - SELinux, cloudproviders, PackageKit disabled
//! - Tests, docs, introspection disabled
//! - po/ subdir patched out (no gettext)
//! - i18n.merge_file() calls patched to configure_file() (no translations)
//! - gnome.post_install() patched out (no host tools at build time)
//! - Validation tests (desktop-file-validate, appstreamcli) patched out

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { nautilusSourceRecipe } from "./nautilus-source.js";

// Core GNOME deps
import { gtk4Recipe, gtk4RuntimeDeps } from "../gtk4/gtk4.js";
import { libadwaitaRecipe, libadwaitaRuntimeDeps } from "../libadwaita/libadwaita.js";
import { gnomeDesktopRecipe } from "../gnome-desktop/gnome-desktop.js";
import { gnomeAutoarRecipe } from "../gnome-autoar/gnome-autoar.js";
import { tinysparqlRecipe, tinysparqlRuntimeDeps } from "../tinysparql/tinysparql.js";
import { libportalRecipe } from "../libportal/libportal.js";

// GLib family
import { glibRecipe } from "../glib/glib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { zlibRecipe } from "../zlib/zlib.js";

// Graphics stack
import { gdkPixbufRecipe } from "../gdk-pixbuf/gdk-pixbuf.js";
import { pangoRecipe } from "../pango/pango.js";
import { cairoRecipe } from "../cairo/cairo.js";
import { harfbuzzRecipe } from "../harfbuzz/harfbuzz.js";
import { fontconfigRecipe } from "../fontconfig/fontconfig.js";
import { freetypeRecipe } from "../freetype/freetype.js";
import { libpngRecipe } from "../libpng/libpng.js";
import { pixmanRecipe } from "../pixman/pixman.js";
import { fribidiRecipe } from "../fribidi/fribidi.js";
import { libepoxyRecipe } from "../libepoxy/libepoxy.js";
import { grapheneRecipe } from "../graphene/graphene.js";
import { libdrmRecipe } from "../libdrm/libdrm.js";
import { waylandRecipe } from "../wayland/wayland.js";
import { libxkbcommonRecipe } from "../libxkbcommon/libxkbcommon.js";

// X11 stack
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
import { libXtstRecipe } from "../libXtst/libXtst.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";

// Accessibility / D-Bus
import { atSpi2CoreRecipe } from "../at-spi2-core/at-spi2-core.js";
import { dbusRecipe } from "../dbus/dbus.js";
import { expatRecipe } from "../expat/expat.js";

// Data/metadata packages
import { sharedMimeInfoRecipe } from "../shared-mime-info/shared-mime-info.js";
import { gsettingsDesktopSchemasRecipe } from "../gsettings-desktop-schemas/gsettings-desktop-schemas.js";
import { xkeyboardConfigRecipe } from "../xkeyboard-config/xkeyboard-config.js";
import { isoCodesRecipe } from "../iso-codes/iso-codes.js";
import { appstreamRecipe } from "../appstream/appstream.js";
import { libseccompRecipe } from "../libseccomp/libseccomp.js";

// Image libs (for gdk-pixbuf)
import { libjpegRecipe } from "../libjpeg/libjpeg.js";
import { libtiffRecipe } from "../libtiff/libtiff.js";

// Archive/compression
import { libarchiveRecipe } from "../libarchive/libarchive.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { xzRecipe } from "../xz/xz.js";
import { zstdRecipe } from "../zstd/zstd.js";
import { opensslRecipe } from "../openssl/openssl.js";

// XML
import { libxml2Recipe } from "../libxml2/libxml2.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";

// Network libs (for tinysparql → libsoup3 chain)
import { libsoup3Recipe, libsoup3RuntimeDeps } from "../libsoup3/libsoup3.js";
import { nghttp2Recipe } from "../nghttp2/nghttp2.js";
import { libpslRecipe } from "../libpsl/libpsl.js";
import { libidn2Recipe } from "../libidn2/libidn2.js";
import { libunistringRecipe } from "../libunistring/libunistring.js";

// Tracker/tinysparql deps
import { jsonGlibRecipe } from "../json-glib/json-glib.js";
import { sqliteRecipe } from "../sqlite/sqlite.js";

// Appstream deps
import { xmlbRecipe } from "../xmlb/xmlb.js";
import { libfyamlRecipe } from "../libfyaml/libfyaml.js";
import { gperfRecipe } from "../gperf/gperf.js";
import { curlRecipe } from "../curl/curl.js";
import { sasscRecipe } from "../sassc/sassc.js";

// Build tools
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

// ---------- runtime_deps ----------
// Composed from upstream runtime dep lists (libadwaita ⊃ gtk4, tinysparql ⊃ libsoup3)
// plus nautilus-specific shared-lib providers.
const nautilusRuntimeDeps = [...new Set([
  ...libadwaitaRuntimeDeps,   // includes gtk4RuntimeDeps transitively
  ...tinysparqlRuntimeDeps,   // includes libsoup3RuntimeDeps transitively
  // Nautilus-specific extras (not in the above unions):
  "gnome-autoar-0", "gnome-desktop-4", "gsettings-desktop-schemas",
  "iso-codes", "libadwaita", "libarchive", "libportal", "libseccomp",
  "tracker-sparql-3.0", "xkeyboard-config",
])].sort();

// ---------- pkgConfigDeps ----------
// All packages that provide .pc files needed by meson's dependency resolution.
// Meson resolves each dependency() call independently via pkg-config, so every
// transitive .pc must be on PKG_CONFIG_PATH.
// pkgConfigDeps: dep names whose lib/pkgconfig + share/pkgconfig are added to PKG_CONFIG_PATH.
// Meson resolves each dependency() call independently via pkg-config, so every
// transitive .pc must be on PKG_CONFIG_PATH.
const pkgConfigDepNames = [
  "glib", "libffi", "pcre2", "zlib",
  "gtk4", "libadwaita", "gdk-pixbuf",
  "pango", "cairo", "harfbuzz", "fontconfig", "freetype",
  "libpng", "pixman", "fribidi", "libepoxy", "graphene", "libdrm",
  "wayland", "libxkbcommon",
  "libX11", "libXext", "libXrender", "libXi", "libXrandr",
  "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
  "libXfixes", "libXau", "libXcb", "libXdmcp", "libXtst",
  "at-spi2-core", "dbus", "expat",
  "gnome-desktop-4", "gnome-autoar-0", "tracker-sparql-3.0",
  "libportal", "libportal-gtk4",
  "gsettings-desktop-schemas", "xkeyboard-config", "iso-codes",
  "shared-mime-info", "appstream", "libseccomp",
  "libjpeg", "libtiff",
  "libarchive", "bzip2", "xz", "zstd", "openssl",
  "libxml2", "libiconv",
  "libsoup3", "nghttp2", "libpsl", "libidn2", "libunistring",
  "json-glib", "sqlite",
  "xmlb", "libfyaml", "curl",
  "xorgproto",
];

// All deps that provide shared libraries (for rpath-link)
const libDepNames = [
  "glib", "libffi", "pcre2", "zlib",
  "gtk4", "libadwaita", "gdk-pixbuf",
  "pango", "cairo", "harfbuzz", "fontconfig", "freetype",
  "libpng", "pixman", "fribidi", "libepoxy", "graphene", "libdrm",
  "wayland", "libxkbcommon",
  "libX11", "libXext", "libXrender", "libXi", "libXrandr",
  "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
  "libXfixes", "libXau", "libXcb", "libXdmcp", "libXtst",
  "at-spi2-core", "dbus", "expat",
  "gnome-autoar-0", "tracker-sparql-3.0",
  "libportal",
  "libseccomp",
  "libjpeg", "libtiff",
  "libarchive", "bzip2", "xz", "zstd", "openssl",
  "libxml2", "libiconv",
  "libsoup3", "nghttp2", "libpsl", "libidn2", "libunistring",
  "json-glib", "sqlite",
  "appstream", "curl", "xmlb", "libfyaml",
  "gnome-desktop-4",
];

const rpathLinkFlags = libDepNames.map((d) => `-Wl,-rpath-link,/deps/${d}/lib`).join(" ");

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    binDeps: ["glib", "gdk-pixbuf", "shared-mime-info", "gperf", "sassc", "wayland"],
    includeDeps: [
      "glib", "libffi", "pcre2", "zlib",
      "gtk4", "libadwaita", "gdk-pixbuf",
      "pango", "cairo", "harfbuzz", "fontconfig", "freetype",
      "libpng", "pixman", "fribidi", "libepoxy", "graphene", "libdrm",
      "wayland", "libxkbcommon",
      "libX11", "libXext", "libXrender", "libXi", "libXrandr",
      "libXcursor", "libXinerama", "libXdamage", "libXcomposite",
      "libXfixes", "libXau", "libXcb", "libXdmcp", "libXtst",
      "at-spi2-core", "dbus", "expat",
      "gnome-desktop-4", "gnome-autoar-0", "tracker-sparql-3.0",
      "libportal", "gsettings-desktop-schemas",
      "libseccomp",
      "libjpeg", "libtiff",
      "libarchive", "bzip2", "xz", "zstd", "openssl",
      "libxml2", "libiconv",
      "libsoup3", "nghttp2", "libpsl", "libidn2", "libunistring",
      "json-glib", "sqlite",
      "appstream", "curl", "xmlb", "libfyaml",
    ],
    includePaths: [
      "/deps/glib/include/glib-2.0",
      "/deps/glib/lib/glib-2.0/include",
      "/deps/libxml2/include/libxml2",
      "/deps/dbus/include/dbus-1.0",
      "/deps/dbus/lib/dbus-1.0/include",
      "/deps/cairo/include/cairo",
      "/deps/freetype/include/freetype2",
      "/deps/harfbuzz/include/harfbuzz",
      "/deps/pango/include/pango-1.0",
      "/deps/libdrm/include/libdrm",
      "/deps/gdk-pixbuf/include/gdk-pixbuf-2.0",
      "/deps/gdk-pixbuf/lib/gdk-pixbuf-2.0/include",
      "/deps/gsettings-desktop-schemas/include/gsettings-desktop-schemas",
    ],
    libDeps: libDepNames,
    pkgConfigDeps: pkgConfigDepNames,
    pkgConfigPaths: [
      "/deps/xorgproto/share/pkgconfig",
      "/deps/shared-mime-info/share/pkgconfig",
      "/deps/gsettings-desktop-schemas/share/pkgconfig",
      "/deps/xkeyboard-config/share/pkgconfig",
      "/deps/iso-codes/share/pkgconfig",
    ],
  }),
  sourceDir: true,
  script: `
# Patch g_variant_builder_init_static → g_variant_builder_init in C source.
# init_static was added in GLib 2.84, our GLib is 2.82.5.
# For static type constants like G_VARIANT_TYPE_VARDICT, init() is equivalent.
sed -i 's/g_variant_builder_init_static/g_variant_builder_init/g' src/nautilus-application.c

export LDFLAGS="$HOD_DUMMY_RPATH \\
  ${rpathLinkFlags}"

# ---- Patch main meson.build ----
python3 << 'PYEOF'
import re

# 1. Patch main meson.build
with open('meson.build', 'r') as f:
    content = f.read()

# Remove -Werror=missing-include-dirs: some .pc files reference non-existent
# include paths in the sandbox (e.g., /include from prefix=/ installs).
# The headers are found through other -I flags from relocatable .pc files.
content = content.replace("'-Werror=missing-include-dirs',\\n", "")

# Remove subdir('po') — needs gettext tools we don't have
content = content.replace("  'po',\\n", "")

# Remove gnome.post_install(...) block — needs host tools (gtk-update-icon-cache, etc.)
content = re.sub(
    r"gnome\\.post_install\\(.*?\\)",
    "# gnome.post_install patched out",
    content, count=1, flags=re.DOTALL)

with open('meson.build', 'w') as f:
    f.write(content)

# 2. Patch data/meson.build
with open('data/meson.build', 'r') as f:
    content = f.read()

# Remove po_dir variable (no longer needed without i18n)
content = content.replace("po_dir = join_paths(meson.project_source_root(), 'po')\\n", "")

# Replace i18n.merge_file for desktop with configure_file.
# The inner configure_file already substitutes @icon@, producing a valid desktop file.
# Without translations, the output is identical.
content = re.sub(
    r"desktop = i18n\\.merge_file\\(.*?^\\)",
    "desktop = configure_file(\\n"
    "  input: configure_file(\\n"
    "    input: files('org.gnome.Nautilus.desktop.in.in'),\\n"
    "    output: 'org.gnome.Nautilus.desktop.in',\\n"
    "    configuration: desktop_conf\\n"
    "  ),\\n"
    "  output: '@0@.desktop'.format(application_id),\\n"
    "  configuration: desktop_conf,\\n"
    "  install: true,\\n"
    "  install_dir: desktopdir,\\n"
    ")",
    content, count=1, flags=re.MULTILINE | re.DOTALL)

# Replace i18n.merge_file for autorun desktop with configure_file
content = re.sub(
    r"desktop_autorun_software = i18n\\.merge_file\\(.*?^\\)",
    "desktop_autorun_software = configure_file(\\n"
    "  input: 'nautilus-autorun-software.desktop.in',\\n"
    "  output: 'nautilus-autorun-software.desktop',\\n"
    "  configuration: configuration_data(),\\n"
    "  install: true,\\n"
    "  install_dir: desktopdir,\\n"
    ")",
    content, count=1, flags=re.MULTILINE | re.DOTALL)

# Replace i18n.merge_file for appdata with configure_file
content = re.sub(
    r"appdata = i18n\\.merge_file\\(.*?^\\)",
    "appdata = configure_file(\\n"
    "  input: configure_file(\\n"
    "    input: files('org.gnome.Nautilus.metainfo.xml.in.in'),\\n"
    "    output: 'org.gnome.Nautilus.metainfo.xml.in',\\n"
    "    configuration: appdata_conf\\n"
    "  ),\\n"
    "  output: '@0@.metainfo.xml'.format(application_id),\\n"
    "  configuration: appdata_conf,\\n"
    "  install: true,\\n"
    "  install_dir: join_paths(datadir, 'metainfo'),\\n"
    ")",
    content, count=1, flags=re.MULTILINE | re.DOTALL)

# Remove validation tests (desktop-file-validate, appstreamcli)
# These tools aren't available in the sandbox and aren't needed for building.
content = re.sub(
    r"desktop_file_validate = find_program.*?endif",
    "# desktop_file_validate tests removed",
    content, count=1, flags=re.DOTALL)
content = re.sub(
    r"appstreamcli = find_program.*?endif",
    "# appstreamcli tests removed",
    content, count=1, flags=re.DOTALL)

with open('data/meson.build', 'w') as f:
    f.write(content)
PYEOF

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddefault_library=shared \\
  -Dextensions=false \\
  -Dselinux=false \\
  -Dcloudproviders=false \\
  -Dpackagekit=false \\
  -Ddocs=false \\
  -Dtests=none \\
  -Dintrospection=false \\
  -Dprofile=

ninja -C build
DESTDIR=$OUT ninja -C build install

# Provide a stub schema for org.freedesktop.Tracker3.Miner.Files.
# Nautilus calls g_settings_new() on this schema unconditionally.
# The real schema comes from tracker-miners (a separate package we don't build).
# Without this stub, GLib aborts: "Settings schema is not installed".
cat > $OUT/share/glib-2.0/schemas/org.freedesktop.Tracker3.Miner.Files.gschema.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<schemalist>
  <schema id="org.freedesktop.Tracker3.Miner.Files" path="/org/freedesktop/Tracker3/Miner/Files/">
    <key name="index-recursive-directories" type="as">
      <default>[]</default>
      <summary>Directories to index recursively</summary>
    </key>
    <key name="index-single-directories" type="as">
      <default>[]</default>
      <summary>Directories to index non-recursively</summary>
    </key>
  </schema>
</schemalist>
EOF

# Compile gsettings schemas manually (gnome.post_install was patched out)
# glib-compile-schemas is provided by the glib dep.
/deps/glib/bin/glib-compile-schemas $OUT/share/glib-2.0/schemas

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", nautilusSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    // Core GNOME deps
    dep("gtk4", gtk4Recipe),
    dep("libadwaita", libadwaitaRecipe),
    dep("gnome-desktop-4", gnomeDesktopRecipe),
    dep("gnome-autoar-0", gnomeAutoarRecipe),
    dep("tracker-sparql-3.0", tinysparqlRecipe),
    dep("libportal", libportalRecipe),
    // GLib family
    dep("glib", glibRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("zlib", zlibRecipe),
    // Graphics stack
    dep("gdk-pixbuf", gdkPixbufRecipe),
    dep("pango", pangoRecipe),
    dep("cairo", cairoRecipe),
    dep("harfbuzz", harfbuzzRecipe),
    dep("fontconfig", fontconfigRecipe),
    dep("freetype", freetypeRecipe),
    dep("libpng", libpngRecipe),
    dep("pixman", pixmanRecipe),
    dep("fribidi", fribidiRecipe),
    dep("libepoxy", libepoxyRecipe),
    dep("graphene", grapheneRecipe),
    dep("libdrm", libdrmRecipe),
    dep("wayland", waylandRecipe),
    dep("libxkbcommon", libxkbcommonRecipe),
    // X11 stack
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
    dep("libXtst", libXtstRecipe),
    dep("xorgproto", xorgprotoRecipe),
    // Accessibility / D-Bus
    dep("at-spi2-core", atSpi2CoreRecipe),
    dep("dbus", dbusRecipe),
    dep("expat", expatRecipe),
    // Data/metadata packages
    dep("shared-mime-info", sharedMimeInfoRecipe),
    dep("gsettings-desktop-schemas", gsettingsDesktopSchemasRecipe),
    dep("xkeyboard-config", xkeyboardConfigRecipe),
    dep("iso-codes", isoCodesRecipe),
    dep("appstream", appstreamRecipe),
    dep("libseccomp", libseccompRecipe),
    // Image libs
    dep("libjpeg", libjpegRecipe),
    dep("libtiff", libtiffRecipe),
    // Archive/compression
    dep("libarchive", libarchiveRecipe),
    dep("bzip2", bzip2Recipe),
    dep("xz", xzRecipe),
    dep("zstd", zstdRecipe),
    dep("openssl", opensslRecipe),
    // XML
    dep("libxml2", libxml2Recipe),
    dep("libiconv", libiconvRecipe),
    // Network
    dep("libsoup3", libsoup3Recipe),
    dep("nghttp2", nghttp2Recipe),
    dep("libpsl", libpslRecipe),
    dep("libidn2", libidn2Recipe),
    dep("libunistring", libunistringRecipe),
    // Tracker deps
    dep("json-glib", jsonGlibRecipe),
    dep("sqlite", sqliteRecipe),
    // Appstream deps
    dep("xmlb", xmlbRecipe),
    dep("libfyaml", libfyamlRecipe),
    dep("gperf", gperfRecipe),
    dep("curl", curlRecipe),
    dep("sassc", sasscRecipe),
    // Build tools
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: nautilusRuntimeDeps,
});

await importToStore(recipe);
export const nautilusRecipe = recipe;
