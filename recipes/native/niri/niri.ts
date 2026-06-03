//! niri — scrollable-tiling Wayland compositor.
//!
//! First pass packages the compositor/session and upstream session metadata,
//! without screencast support. The Hod VM profile supplies a minimal config and
//! companion apps separately.

import { dep, HOD_DUMMY_RPATH_FLAG, importToStore } from "../../../js/src/index.js";
import { cargoBuild } from "../../helpers/rust.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust/rust.js";
import { niriSourceRecipe } from "./niri-source.js";

import { bzip2Recipe } from "../bzip2/bzip2.js";
import { cairoRecipe } from "../cairo/cairo.js";
import { dbusRecipe } from "../dbus/dbus.js";
import { eudevRecipe } from "../eudev/eudev.js";
import { expatRecipe } from "../expat/expat.js";
import { fontconfigRecipe } from "../fontconfig/fontconfig.js";
import { freetypeRecipe } from "../freetype/freetype.js";
import { fribidiRecipe } from "../fribidi/fribidi.js";
import { glibRecipe } from "../glib/glib.js";
import { harfbuzzRecipe } from "../harfbuzz/harfbuzz.js";
import { libX11Recipe } from "../libX11/libX11.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { libXextRecipe } from "../libXext/libXext.js";
import { libXrenderRecipe } from "../libXrender/libXrender.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { libdisplayInfoRecipe } from "../libdisplay-info/libdisplay-info.js";
import { libglvndRecipe } from "../libglvnd/libglvnd.js";
import { libinputRecipe } from "../libinput/libinput.js";
import { libpngRecipe } from "../libpng/libpng.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libxkbcommonRecipe } from "../libxkbcommon/libxkbcommon.js";
import { mesaRecipe } from "../mesa/mesa.js";
import { pangoRecipe } from "../pango/pango.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { pixmanRecipe } from "../pixman/pixman.js";
import { seatdRecipe } from "../seatd/seatd.js";
import { waylandRecipe } from "../wayland/wayland.js";
import { caCertificatesRecipe } from "../ca-certificates/ca-certificates.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { zlibRecipe } from "../zlib/zlib.js";

export const niriRuntimeDeps = [
  "bzip2",
  "cairo",
  "dbus",
  "eudev",
  "expat",
  "fontconfig",
  "freetype",
  "fribidi",
  "glib",
  "harfbuzz",
  "libX11",
  "libXau",
  "libXcb",
  "libXdmcp",
  "libXext",
  "libXrender",
  "libdisplay-info",
  "libffi",
  "libglvnd",
  "libinput",
  "libpng",
  "libxkbcommon",
  "mesa",
  "pango",
  "pcre2",
  "pixman",
  "seatd",
  "toolchain",
  "wayland",
  "zlib",
];

const recipe = await cargoBuild({
  name: "niri",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  source: "source",
  deps: [
    dep("source", niriSourceRecipe),
    dep("ca-certs", caCertificatesRecipe),
    dep("bzip2", bzip2Recipe),
    dep("cairo", cairoRecipe),
    dep("dbus", dbusRecipe),
    dep("eudev", eudevRecipe),
    dep("expat", expatRecipe),
    dep("fontconfig", fontconfigRecipe),
    dep("freetype", freetypeRecipe),
    dep("fribidi", fribidiRecipe),
    dep("glib", glibRecipe),
    dep("harfbuzz", harfbuzzRecipe),
    dep("libX11", libX11Recipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("libXext", libXextRecipe),
    dep("libXrender", libXrenderRecipe),
    dep("libffi", libffiRecipe),
    dep("libdisplay-info", libdisplayInfoRecipe),
    dep("libglvnd", libglvndRecipe),
    dep("libinput", libinputRecipe),
    dep("libpng", libpngRecipe),
    dep("libxkbcommon", libxkbcommonRecipe),
    dep("mesa", mesaRecipe),
    dep("pango", pangoRecipe),
    dep("pcre2", pcre2Recipe),
    dep("pixman", pixmanRecipe),
    dep("seatd", seatdRecipe),
    dep("wayland", waylandRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("zlib", zlibRecipe),
  ],
  env: {
    CARGO_HTTP_CAINFO: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",
    SSL_CERT_FILE: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",
    NIRI_BUILD_COMMIT: "Hod",
    PKG_CONFIG_PATH: [
      "/deps/bzip2/lib/pkgconfig",
      "/deps/cairo/lib/pkgconfig",
      "/deps/dbus/lib/pkgconfig",
      "/deps/eudev/lib/pkgconfig",
      "/deps/expat/lib/pkgconfig",
      "/deps/fontconfig/lib/pkgconfig",
      "/deps/freetype/lib/pkgconfig",
      "/deps/fribidi/lib/pkgconfig",
      "/deps/glib/lib/pkgconfig",
      "/deps/harfbuzz/lib/pkgconfig",
      "/deps/libX11/lib/pkgconfig",
      "/deps/libXau/lib/pkgconfig",
      "/deps/libXcb/lib/pkgconfig",
      "/deps/libXdmcp/lib/pkgconfig",
      "/deps/libXext/lib/pkgconfig",
      "/deps/libXrender/lib/pkgconfig",
      "/deps/xorgproto/share/pkgconfig",
      "/deps/libffi/lib/pkgconfig",
      "/deps/libdisplay-info/lib/pkgconfig",
      "/deps/libglvnd/lib/pkgconfig",
      "/deps/libinput/lib/pkgconfig",
      "/deps/libpng/lib/pkgconfig",
      "/deps/libxkbcommon/lib/pkgconfig",
      "/deps/mesa/lib/pkgconfig",
      "/deps/pango/lib/pkgconfig",
      "/deps/pcre2/lib/pkgconfig",
      "/deps/pixman/lib/pkgconfig",
      "/deps/seatd/lib/pkgconfig",
      "/deps/wayland/lib/pkgconfig",
      "/deps/zlib/lib/pkgconfig",
    ].join(":"),
    C_INCLUDE_PATH: [
      "/deps/bzip2/include",
      "/deps/cairo/include/cairo",
      "/deps/dbus/include/dbus-1.0",
      "/deps/dbus/lib/dbus-1.0/include",
      "/deps/eudev/include",
      "/deps/expat/include",
      "/deps/fontconfig/include",
      "/deps/freetype/include/freetype2",
      "/deps/fribidi/include/fribidi",
      "/deps/glib/include/glib-2.0",
      "/deps/glib/lib/glib-2.0/include",
      "/deps/harfbuzz/include/harfbuzz",
      "/deps/libX11/include",
      "/deps/libXau/include",
      "/deps/libXcb/include",
      "/deps/libXdmcp/include",
      "/deps/libXext/include",
      "/deps/libXrender/include",
      "/deps/libffi/include",
      "/deps/libdisplay-info/include",
      "/deps/libglvnd/include",
      "/deps/libinput/include",
      "/deps/libpng/include",
      "/deps/libxkbcommon/include",
      "/deps/mesa/include",
      "/deps/pango/include/pango-1.0",
      "/deps/pcre2/include",
      "/deps/pixman/include/pixman-1",
      "/deps/seatd/include",
      "/deps/wayland/include",
      "/deps/xorgproto/include",
      "/deps/zlib/include",
    ].join(":"),
    LIBRARY_PATH: [
      "/deps/bzip2/lib",
      "/deps/cairo/lib",
      "/deps/dbus/lib",
      "/deps/eudev/lib",
      "/deps/expat/lib",
      "/deps/fontconfig/lib",
      "/deps/freetype/lib",
      "/deps/fribidi/lib",
      "/deps/glib/lib",
      "/deps/harfbuzz/lib",
      "/deps/libX11/lib",
      "/deps/libXau/lib",
      "/deps/libXcb/lib",
      "/deps/libXdmcp/lib",
      "/deps/libXext/lib",
      "/deps/libXrender/lib",
      "/deps/libffi/lib",
      "/deps/libdisplay-info/lib",
      "/deps/libglvnd/lib",
      "/deps/libinput/lib",
      "/deps/libpng/lib",
      "/deps/libxkbcommon/lib",
      "/deps/mesa/lib",
      "/deps/pango/lib",
      "/deps/pcre2/lib",
      "/deps/pixman/lib",
      "/deps/seatd/lib",
      "/deps/wayland/lib",
      "/deps/zlib/lib",
    ].join(":"),
    LD_LIBRARY_PATH: [
      "/deps/bzip2/lib",
      "/deps/cairo/lib",
      "/deps/dbus/lib",
      "/deps/eudev/lib",
      "/deps/expat/lib",
      "/deps/fontconfig/lib",
      "/deps/freetype/lib",
      "/deps/fribidi/lib",
      "/deps/glib/lib",
      "/deps/harfbuzz/lib",
      "/deps/libX11/lib",
      "/deps/libXau/lib",
      "/deps/libXcb/lib",
      "/deps/libXdmcp/lib",
      "/deps/libXext/lib",
      "/deps/libXrender/lib",
      "/deps/libffi/lib",
      "/deps/libdisplay-info/lib",
      "/deps/libglvnd/lib",
      "/deps/libinput/lib",
      "/deps/libpng/lib",
      "/deps/libxkbcommon/lib",
      "/deps/mesa/lib",
      "/deps/pango/lib",
      "/deps/pcre2/lib",
      "/deps/pixman/lib",
      "/deps/seatd/lib",
      "/deps/wayland/lib",
      "/deps/zlib/lib",
    ].join(":"),
    RUSTFLAGS: [
      `-C link-arg=${HOD_DUMMY_RPATH_FLAG}`,
      "-C link-arg=-Wl,--push-state,--no-as-needed",
      "-C link-arg=-lEGL",
      "-C link-arg=-lwayland-client",
      "-C link-arg=-Wl,--pop-state",
    ].join(" "),
  },
  cargoFlags: ["--no-default-features", "--features", "dbus"],
  unsafe_flags: 0x01,
  runtime_deps: niriRuntimeDeps,
  postInstallScript: `
mkdir -p $OUT/bin $OUT/share/wayland-sessions $OUT/share/xdg-desktop-portal $OUT/lib/systemd/user $OUT/share/doc/niri

cp /tmp/build/resources/niri-session $OUT/bin/niri-session
chmod +x $OUT/bin/niri-session
sed -i 's|exec niri --session|exec /usr/hod/system/current/pkgs/niri/bin/niri --session|' $OUT/bin/niri-session
sed -i 's|systemctl --user --wait start niri.service|systemctl --user --wait start niri.service|' $OUT/bin/niri-session

cp /tmp/build/resources/niri.desktop $OUT/share/wayland-sessions/niri.desktop
sed -i 's|^Exec=.*|Exec=/usr/hod/system/current/pkgs/niri/bin/niri-session|' $OUT/share/wayland-sessions/niri.desktop

cp /tmp/build/resources/niri-portals.conf $OUT/share/xdg-desktop-portal/niri-portals.conf
cp /tmp/build/resources/niri.service $OUT/lib/systemd/user/niri.service
sed -i 's|ExecStart=niri --session|ExecStart=/usr/hod/system/current/pkgs/niri/bin/niri --session|' $OUT/lib/systemd/user/niri.service
cp /tmp/build/resources/niri-shutdown.target $OUT/lib/systemd/user/niri-shutdown.target
cp /tmp/build/resources/default-config.kdl $OUT/share/doc/niri/default-config.kdl
`,
});

await importToStore(recipe);
export const niriRecipe = recipe;
