import {
  dep,
  importToStore,
  shellBuild,
  hermeticPreamble,
  depSubpath,
} from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { zigRecipe } from "../zig/zig.js";
import { zigSourceRecipe } from "../zig/zig-source.js";
import { ghosttySourceRecipe } from "./ghostty-source.js";
import { caCertificatesRecipe } from "../ca-certificates/ca-certificates.js";
import { depEnvFromList, caCertEnv } from "../../helpers/build-env.js";

import { gtk4Recipe, gtk4RuntimeDeps } from "../gtk4/gtk4.js";
import { libadwaitaRecipe } from "../libadwaita/libadwaita.js";
import { glibRecipe } from "../glib/glib.js";
import { pangoRecipe } from "../pango/pango.js";
import { cairoRecipe } from "../cairo/cairo.js";
import { gdkPixbufRecipe } from "../gdk-pixbuf/gdk-pixbuf.js";
import { libepoxyRecipe } from "../libepoxy/libepoxy.js";
import { grapheneRecipe } from "../graphene/graphene.js";
import { atSpi2CoreRecipe } from "../at-spi2-core/at-spi2-core.js";
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
import { libXtstRecipe } from "../libXtst/libXtst.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { dbusRecipe } from "../dbus/dbus.js";
import { libxml2Recipe } from "../libxml2/libxml2.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { waylandRecipe } from "../wayland/wayland.js";
import { waylandProtocolsRecipe } from "../wayland-protocols/wayland-protocols.js";
import { libxkbcommonRecipe } from "../libxkbcommon/libxkbcommon.js";
import { libdrmRecipe } from "../libdrm/libdrm.js";
import { mesaRecipe } from "../mesa/mesa.js";
import { libglvndRecipe } from "../libglvnd/libglvnd.js";
import { sharedMimeInfoRecipe } from "../shared-mime-info/shared-mime-info.js";
import { gsettingsDesktopSchemasRecipe } from "../gsettings-desktop-schemas/gsettings-desktop-schemas.js";
import { isoCodesRecipe } from "../iso-codes/iso-codes.js";
import { libjpegRecipe } from "../libjpeg/libjpeg.js";
import { libtiffRecipe } from "../libtiff/libtiff.js";
import { zstdRecipe } from "../zstd/zstd.js";
import { libiconvRecipe } from "../libiconv/libiconv.js";
import { xzRecipe } from "../xz/xz.js";
import { ncursesRecipe } from "../ncurses/ncurses.js";
import { xkeyboardConfigRecipe } from "../xkeyboard-config/xkeyboard-config.js";
import { patchelfRecipe } from "../patchelf/patchelf.js";

const cDepNames = [
  { name: "gtk4", extraIncludes: ["include/gtk-4.0"] },
  { name: "libadwaita", extraIncludes: ["include/libadwaita-1"] },
  { name: "glib", extraIncludes: ["include/glib-2.0", "lib/glib-2.0/include"] },
  { name: "pango", extraIncludes: ["include/pango-1.0"] },
  { name: "cairo", extraIncludes: ["include/cairo"] },
  "gdk-pixbuf",
  "libepoxy",
  "graphene",
  { name: "harfbuzz", extraIncludes: ["include/harfbuzz"] },
  "fontconfig",
  { name: "freetype", extraIncludes: ["include/freetype2"] },
  { name: "fribidi", extraIncludes: ["include/fribidi"] },
  "libpng",
  { name: "pixman", extraIncludes: ["include/pixman-1"] },
  "zlib",
  "expat",
  "bzip2",
  "libffi",
  "pcre2",
  "libX11",
  "libXext",
  "libXrender",
  "libXi",
  "libXrandr",
  "libXcursor",
  "libXinerama",
  "libXdamage",
  "libXcomposite",
  "libXfixes",
  "libXtst",
  "libXau",
  "libXcb",
  "libXdmcp",
  "dbus",
  "libxml2",
  "xorgproto",
  "wayland",
      "wayland-protocols",
      "xkeyboard-config",
      "libxkbcommon",
  "libdrm",
  "mesa",
  "libglvnd",
  "shared-mime-info",
  "gsettings-desktop-schemas",
  "iso-codes",
  "libjpeg",
  "libtiff",
  "zstd",
  "libiconv",
  "xz",
];

const recipe = await shellBuild({
  shell: depSubpath("toolchain", "bin/busybox"),
  preamble: hermeticPreamble({ shell: "toolchain", glibcLinker: "toolchain" }),
  env: {
    PATH: `/tmp/bin:${depSubpath("zig", "bin")}:${depSubpath("wayland", "bin")}:${depSubpath("ncurses", "bin")}:${depSubpath("toolchain", "bin")}`,
    ZIG_GLOBAL_CACHE_DIR: "/tmp/zig-cache",
    ZIG_LOCAL_CACHE_DIR: "/tmp/zig-local-cache",
    ...caCertEnv(),
    ...depEnvFromList(cDepNames),
  },
  sourceDir: true,
  script: `
mkdir -p /etc/ssl/certs
ln -sf /deps/ca-certs/etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

# Stub msgfmt (i18n .po → .mo compiler)
mkdir -p /tmp/bin
printf '#!/bin/sh\\nout=\\nwhile [ \$# -gt 0 ]; do case \$1 in -o) shift; out=\$1;; esac; shift; done\\n[ -n "\$out" ] && touch "\$out"\\n' > /tmp/bin/msgfmt
chmod +x /tmp/bin/msgfmt

# Merge dep headers/libs/pkgconfig into standard paths for zig's native
# target detection.  Zig compiles helper executables (ghostty-build-data
# etc.) for the native target, which expects to find libc at /usr/include
# and libraries at /usr/lib.
mkdir -p /usr/include /usr/include/x86_64-linux-gnu
mkdir -p /usr/lib /usr/lib/pkgconfig /usr/lib/x86_64-linux-gnu

# Make glibc headers available for zig native target detection
# Toolchain puts full glibc headers at sysroot/include/
rm -rf /usr/include
ln -sf /deps/toolchain/sysroot/include /usr/include

# Merge dep content into standard paths
for dep in /deps/*/; do
  if [ -d "$dep/include" ]; then
    ln -sf "$dep"/include/* /usr/include/ 2>/dev/null || true
  fi
  if [ -d "$dep/lib" ]; then
    ln -sf "$dep"/lib/*.so* /usr/lib/ 2>/dev/null || true
    ln -sf "$dep"/lib/pkgconfig/* /usr/lib/pkgconfig/ 2>/dev/null || true
  fi
  if [ -d "$dep/share/pkgconfig" ]; then
    ln -sf "$dep"/share/pkgconfig/* /usr/lib/pkgconfig/ 2>/dev/null || true
  fi
done

# Stub harfbuzz-gobject.pc (gobject dep expects it via pkg-config)
cat > /usr/lib/pkgconfig/harfbuzz-gobject.pc << 'PCEOF'
prefix=/deps/harfbuzz
libdir=\${prefix}/lib
includedir=\${prefix}/include
Name: harfbuzz-gobject
Description: HarfBuzz GObject (stub)
Version: 11.0.0
Requires: harfbuzz
Libs:
Cflags:
PCEOF

# Zig detects native as musl (reads /proc/self/exe -> busybox).
# Provide musl headers at /usr/include so zig's native libc search succeeds,
# and symlink the musl dynamic linker to the glibc linker so compiled
# native helpers can actually execute in the sandbox.
rm -rf /usr/include
ln -sf /deps/zig/lib/libc/musl/include /usr/include
ln -sf /deps/toolchain/lib/ld-linux-x86-64.so.2 /lib/ld-musl-x86_64.so.1

# Create a lib overlay with fixed .pc files and symlinks.
# 1. libadwaita-1.pc requires 'appstream' which we don't have - create
#    a stub without that requirement so pkg-config succeeds.
# 2. Ghostty uses linkSystemLibrary2("libadwaita-1") which causes zig
#    to look for liblibadwaita-1.so (double "lib"). Create a symlink.
mkdir -p /tmp/lib-overlay/lib /tmp/lib-overlay/pkgconfig
cat > /tmp/lib-overlay/pkgconfig/libadwaita-1.pc << 'PCEOF'
prefix=/deps/libadwaita
includedir=\${prefix}/include
libdir=\${prefix}/lib

Name: Adwaita
Description: Building blocks for modern GNOME applications
Version: 1.7.12
Requires: gtk4
Libs: -L\${libdir} -ladwaita-1
Cflags: -I\${includedir}/libadwaita-1
PCEOF

ln -sf /deps/libadwaita/lib/libadwaita-1.so /tmp/lib-overlay/lib/liblibadwaita-1.so
mkdir -p /usr/lib/x86_64-linux-gnu
ln -sf /deps/libadwaita/lib/libadwaita-1.so /usr/lib/x86_64-linux-gnu/libadwaita-1.so
export LIBRARY_PATH="/tmp/lib-overlay/lib:\${LIBRARY_PATH}"
export PKG_CONFIG_PATH="/tmp/lib-overlay/pkgconfig:/usr/lib/pkgconfig:\${PKG_CONFIG_PATH}"

echo "=== Building Ghostty 1.3.1 ==="
echo "zig version: $(zig version)"

zig build \\
  --prefix $OUT \\
  -Dtarget=x86_64-linux-gnu.2.40 \\
  -Doptimize=ReleaseFast \\
  -Dcpu=baseline \\
  -fno-sys=gtk4-layer-shell

# Ghostty post-install fixups, v9:
# - rewrite desktop entries to use PATH lookup
# - replace the generated launcher with a stable script that cooperates with
#   Hod's runtime wrapper pass
if [ -f "$OUT/share/applications/com.mitchellh.ghostty.desktop" ]; then
  sed -i 's#TryExec=/out/bin/ghostty#TryExec=ghostty#; s#Exec=/out/bin/ghostty#Exec=ghostty#' \
    "$OUT/share/applications/com.mitchellh.ghostty.desktop"
fi

# Replace Ghostty's launcher script so Hod's runtime wrapper can target a
# stable script that does not recurse into itself via an absolute store path.
if [ -f "$OUT/bin/ghostty" ]; then
  mv "$OUT/bin/ghostty" "$OUT/bin/ghostty-bin"

  # Zig leaves Ghostty's executable with a short /tmp/zig-local-cache RUNPATH.
  # Put enough placeholder space here for Hod's runtime relocation pass to
  # replace it with store/profile-relative runtime dep paths.
  /deps/patchelf/bin/patchelf \
    --set-rpath '$ORIGIN/../lib:/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/dummy' \
    "$OUT/bin/ghostty-bin"

  cat > "$OUT/bin/ghostty" <<'EOF'
#!/bin/sh
bin_dir=\${0%/*}
if [ "\${bin_dir##*/}" = "_hod_wrapped" ]; then
  bin_dir=\${bin_dir%/*}
fi
export _LIBCONTAINER_CLONED_BINARY=1
exec "$bin_dir/ghostty-bin" "$@"
EOF
  chmod +x "$OUT/bin/ghostty"
fi

echo "=== Ghostty installed ==="
ls -la $OUT/bin/
echo "=== Share ==="
ls $OUT/share/ 2>/dev/null || true
echo "=== Ghostty build complete ==="
`,
  deps: [
    dep("source", ghosttySourceRecipe),
    dep("zig", zigRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("ca-certs", caCertificatesRecipe),
    dep("gtk4", gtk4Recipe),
    dep("libadwaita", libadwaitaRecipe),
    dep("glib", glibRecipe),
    dep("pango", pangoRecipe),
    dep("cairo", cairoRecipe),
    dep("gdk-pixbuf", gdkPixbufRecipe),
    dep("libepoxy", libepoxyRecipe),
    dep("graphene", grapheneRecipe),
    dep("at-spi2-core", atSpi2CoreRecipe),
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
    dep("libXtst", libXtstRecipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("dbus", dbusRecipe),
    dep("libxml2", libxml2Recipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("wayland", waylandRecipe),
      dep("wayland-protocols", waylandProtocolsRecipe),
      dep("xkeyboard-config", xkeyboardConfigRecipe),
      dep("libxkbcommon", libxkbcommonRecipe),
    dep("libdrm", libdrmRecipe),
    dep("mesa", mesaRecipe),
    dep("libglvnd", libglvndRecipe),
    dep("shared-mime-info", sharedMimeInfoRecipe),
    dep("gsettings-desktop-schemas", gsettingsDesktopSchemasRecipe),
    dep("iso-codes", isoCodesRecipe),
    dep("libjpeg", libjpegRecipe),
    dep("libtiff", libtiffRecipe),
    dep("zstd", zstdRecipe),
    dep("libiconv", libiconvRecipe),
    dep("xz", xzRecipe),
    dep("ncurses", ncursesRecipe),
    dep("patchelf", patchelfRecipe),
  ],
  runtime_deps: [
    ...new Set([
      ...gtk4RuntimeDeps,
      "gtk4",
      "gsettings-desktop-schemas",
      "iso-codes",
      "libadwaita",
      "libglvnd",
      "mesa",
      "shared-mime-info",
      "xkeyboard-config",
    ]),
  ].sort(),
  unsafe_flags: 0x01,
});

await importToStore(recipe);
export const ghosttyRecipe = recipe;
