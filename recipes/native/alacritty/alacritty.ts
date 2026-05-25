//! Alacritty — GPU-accelerated terminal emulator.
//!
//! A fast, cross-platform, OpenGL terminal emulator written in Rust.
//! Builds with both Wayland and X11 support enabled.

import {
  dep,
  importToStore,
} from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust/rust.js";
import { cargoBuild } from "../../helpers/rust.js";
import { alacrittySourceRecipe } from "./alacritty-source.js";

import { caCertificatesRecipe } from "../ca-certificates/ca-certificates.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { fontconfigRecipe } from "../fontconfig/fontconfig.js";
import { freetypeRecipe } from "../freetype/freetype.js";
import { expatRecipe } from "../expat/expat.js";
import { glibRecipe } from "../glib/glib.js";
import { libpngRecipe } from "../libpng/libpng.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { waylandRecipe } from "../wayland/wayland.js";
import { waylandProtocolsRecipe } from "../wayland-protocols/wayland-protocols.js";
import { libxkbcommonRecipe } from "../libxkbcommon/libxkbcommon.js";
import { libglvndRecipe } from "../libglvnd/libglvnd.js";
import { libdrmRecipe } from "../libdrm/libdrm.js";
import { mesaRecipe } from "../mesa/mesa.js";
import { libX11Recipe } from "../libX11/libX11.js";
import { libXcursorRecipe } from "../libXcursor/libXcursor.js";
import { libXrandrRecipe } from "../libXrandr/libXrandr.js";
import { libXiRecipe } from "../libXi/libXi.js";
import { libXextRecipe } from "../libXext/libXext.js";
import { libXfixesRecipe } from "../libXfixes/libXfixes.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { libpthreadStubsRecipe } from "../libpthread-stubs/libpthread-stubs.js";
import { xcbProtoRecipe } from "../xcb-proto/xcb-proto.js";
import { xkeyboardConfigRecipe } from "../xkeyboard-config/xkeyboard-config.js";

const recipe = await cargoBuild({
  name: "alacritty",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  source: "source",
  deps: [
    dep("source", alacrittySourceRecipe),
    dep("ca-certs", caCertificatesRecipe),
    dep("openssl", opensslRecipe),
    dep("fontconfig", fontconfigRecipe),
    dep("freetype", freetypeRecipe),
    dep("expat", expatRecipe),
    dep("glib", glibRecipe),
    dep("libpng", libpngRecipe),
    dep("pcre2", pcre2Recipe),
    dep("libffi", libffiRecipe),
    dep("zlib", zlibRecipe),
    dep("bzip2", bzip2Recipe),
    dep("wayland", waylandRecipe),
    dep("wayland-protocols", waylandProtocolsRecipe),
    dep("libxkbcommon", libxkbcommonRecipe),
    dep("libglvnd", libglvndRecipe),
    dep("libdrm", libdrmRecipe),
    dep("mesa", mesaRecipe),
    dep("libX11", libX11Recipe),
    dep("libXcursor", libXcursorRecipe),
    dep("libXrandr", libXrandrRecipe),
    dep("libXi", libXiRecipe),
    dep("libXext", libXextRecipe),
    dep("libXfixes", libXfixesRecipe),
    dep("libxcb", libXcbRecipe),
    dep("libXau", libXauRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("libpthread-stubs", libpthreadStubsRecipe),
    dep("xcb-proto", xcbProtoRecipe),
    dep("xkeyboard-config", xkeyboardConfigRecipe),
  ],
  env: {
    CARGO_HTTP_CAINFO: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",
    SSL_CERT_FILE: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",

    PKG_CONFIG_PATH: [
      "/deps/openssl/lib/pkgconfig",
      "/deps/fontconfig/lib/pkgconfig",
      "/deps/freetype/lib/pkgconfig",
      "/deps/expat/lib/pkgconfig",
      "/deps/glib/lib/pkgconfig",
      "/deps/libpng/lib/pkgconfig",
      "/deps/pcre2/lib/pkgconfig",
      "/deps/libffi/lib/pkgconfig",
      "/deps/zlib/lib/pkgconfig",
      "/deps/bzip2/lib/pkgconfig",
      "/deps/wayland/lib/pkgconfig",
      "/deps/libxkbcommon/lib/pkgconfig",
      "/deps/libglvnd/lib/pkgconfig",
      "/deps/libdrm/lib/pkgconfig",
      "/deps/mesa/lib/pkgconfig",
      "/deps/libX11/lib/pkgconfig",
      "/deps/libXcursor/lib/pkgconfig",
      "/deps/libXrandr/lib/pkgconfig",
      "/deps/libXi/lib/pkgconfig",
      "/deps/libXext/lib/pkgconfig",
      "/deps/libXfixes/lib/pkgconfig",
      "/deps/libxcb/lib/pkgconfig",
      "/deps/libXau/lib/pkgconfig",
      "/deps/libXdmcp/lib/pkgconfig",
      "/deps/xorgproto/share/pkgconfig",
      "/deps/xkeyboard-config/share/pkgconfig",
    ].join(":"),

    C_INCLUDE_PATH: [
      "/deps/fontconfig/include",
      "/deps/freetype/include/freetype2",
      "/deps/expat/include",
      "/deps/glib/include/glib-2.0",
      "/deps/glib/lib/glib-2.0/include",
      "/deps/libpng/include",
      "/deps/pcre2/include",
      "/deps/libffi/include",
      "/deps/wayland/include",
      "/deps/libxkbcommon/include",
      "/deps/libglvnd/include",
      "/deps/libdrm/include",
      "/deps/mesa/include",
      "/deps/libX11/include",
      "/deps/libXcursor/include",
      "/deps/libXrandr/include",
      "/deps/libXi/include",
      "/deps/libXext/include",
      "/deps/libXfixes/include",
      "/deps/libxcb/include",
      "/deps/libXau/include",
      "/deps/libXdmcp/include",
      "/deps/xorgproto/include",
    ].join(":"),

    LD_LIBRARY_PATH: [
      "/deps/rust/lib",
      "/deps/toolchain/lib",
      "/deps/openssl/lib",
      "/deps/fontconfig/lib",
      "/deps/freetype/lib",
      "/deps/expat/lib",
      "/deps/glib/lib",
      "/deps/libpng/lib",
      "/deps/pcre2/lib",
      "/deps/libffi/lib",
      "/deps/zlib/lib",
      "/deps/bzip2/lib",
      "/deps/wayland/lib",
      "/deps/libxkbcommon/lib",
      "/deps/libglvnd/lib",
      "/deps/libdrm/lib",
      "/deps/mesa/lib",
      "/deps/libX11/lib",
      "/deps/libXcursor/lib",
      "/deps/libXrandr/lib",
      "/deps/libXi/lib",
      "/deps/libXext/lib",
      "/deps/libXfixes/lib",
      "/deps/libxcb/lib",
      "/deps/libXau/lib",
      "/deps/libXdmcp/lib",
    ].join(":"),

    LIBRARY_PATH: [
      "/deps/toolchain/sysroot/lib",
      "/deps/toolchain/lib",
      "/deps/openssl/lib",
      "/deps/fontconfig/lib",
      "/deps/freetype/lib",
      "/deps/expat/lib",
      "/deps/glib/lib",
      "/deps/libpng/lib",
      "/deps/pcre2/lib",
      "/deps/libffi/lib",
      "/deps/zlib/lib",
      "/deps/bzip2/lib",
      "/deps/wayland/lib",
      "/deps/libxkbcommon/lib",
      "/deps/libglvnd/lib",
      "/deps/libdrm/lib",
      "/deps/mesa/lib",
      "/deps/libX11/lib",
      "/deps/libXcursor/lib",
      "/deps/libXrandr/lib",
      "/deps/libXi/lib",
      "/deps/libXext/lib",
      "/deps/libXfixes/lib",
      "/deps/libxcb/lib",
      "/deps/libXau/lib",
      "/deps/libXdmcp/lib",
    ].join(":"),

    PATH: "/deps/wayland/bin:/deps/toolchain/bin:/deps/rust/bin",
  },
  cargoFlags: ["--features", "wayland,x11"],
  unsafe_flags: 0x01,
  runtime_deps: [
    "fontconfig",
    "freetype",
    "glib",
    "libX11",
    "libXcursor",
    "libXext",
    "libXfixes",
    "libXrandr",
    "libXi",
    "libdrm",
    "libglvnd",
    "libxkbcommon",
    "libxcb",
    "mesa",
    "toolchain",
    "wayland",
    "xkeyboard-config",
  ].sort(),
  extraBinaries: [],
});

await importToStore(recipe);
export const alacrittyRecipe = recipe;
