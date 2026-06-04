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
import { caCertEnv, depEnvFromList } from "../../helpers/net.js";
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

const alacrittyCDeps = [
  "openssl",
  "fontconfig",
  { name: "freetype", extraIncludes: ["include/freetype2"] },
  "expat",
  { name: "glib", extraIncludes: ["include/glib-2.0", "lib/glib-2.0/include"] },
  "libpng",
  "pcre2",
  "libffi",
  "zlib",
  "bzip2",
  "wayland",
  "libxkbcommon",
  "libglvnd",
  "libdrm",
  "mesa",
  "libX11",
  "libXcursor",
  "libXrandr",
  "libXi",
  "libXext",
  "libXfixes",
  "libxcb",
  "libXau",
  "libXdmcp",
  { name: "xorgproto" },
  { name: "xkeyboard-config" },
];

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
    ...caCertEnv(),
    ...depEnvFromList(alacrittyCDeps),
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
