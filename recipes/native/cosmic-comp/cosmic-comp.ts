//! cosmic-comp — Wayland compositor for COSMIC desktop.
//!
//! Builds cosmic-comp epoch-1.0.13 from source. This is the core compositor
//! built on Smithay + wgpu, handling display management, window management,
//! and input handling.
//!
//! ## C library dependencies
//!
//! cosmic-comp links against many C shared libraries through Rust -sys crates:
//! - libdrm, libgbm (DRM/KMS rendering)
//! - libinput (input device management)
//! - libseat (seat management via seatd)
//! - libudev (device enumeration via eudev)
//! - wayland (Wayland protocol)
//! - libxkbcommon (keyboard handling)
//! - libdisplay-info (EDID/DisplayID parsing)
//! - pixman (pixel manipulation)
//! - fontconfig, freetype (font handling via cosmic-text)
//! - X11 libs (for xwayland backend)
//! - libEGL, libGL (via Mesa + libglvnd)
//!
//! ## Build approach
//!
//! Phase A (initial): Uses cargo with network access to download Rust crate
//! dependencies. The -sys crates use pre-generated FFI bindings (no bindgen
//! needed). C library headers are found via pkg-config.
//!
//! Default features are disabled (removes systemd/logind dependency).
//! COSMIC uses seatd for seat management instead.

import {
  dep,
  importToStore,
} from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust/rust.js";
import { cosmicCompSourceRecipe } from "./cosmic-comp-source.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { caCertificatesRecipe } from "../ca-certificates/ca-certificates.js";
import { llvmRecipe } from "../llvm/llvm.js";

// Graphics / DRM
import { libdrmRecipe, libdrmRuntimeDeps } from "../libdrm/libdrm.js";
import { mesaRecipe } from "../mesa/mesa.js";
import { libglvndRecipe } from "../libglvnd/libglvnd.js";

// Input
import { libinputRecipe } from "../libinput/libinput.js";
import { seatdRecipe } from "../seatd/seatd.js";
import { libevdevRecipe } from "../libevdev/libevdev.js";
import { mtdevRecipe } from "../mtdev/mtdev.js";

// Device management
import { eudevRecipe } from "../eudev/eudev.js";
import { kmodRecipe } from "../kmod/kmod.js";
import { utilLinuxRecipe } from "../util-linux/util-linux.js";

// Display
import { waylandRecipe, waylandRuntimeDeps } from "../wayland/wayland.js";
import { waylandProtocolsRecipe } from "../wayland-protocols/wayland-protocols.js";
import { libxkbcommonRecipe, libxkbcommonRuntimeDeps } from "../libxkbcommon/libxkbcommon.js";
import { libdisplayInfoRecipe } from "../libdisplay-info/libdisplay-info.js";
import { hwdataRecipe } from "../hwdata/hwdata.js";

// Rendering
import { pixmanRecipe, pixmanRuntimeDeps } from "../pixman/pixman.js";

// Fonts
import { fontconfigRecipe, fontconfigRuntimeDeps } from "../fontconfig/fontconfig.js";
import { freetypeRecipe, freetypeRuntimeDeps } from "../freetype/freetype.js";
import { harfbuzzRecipe } from "../harfbuzz/harfbuzz.js";
import { expatRecipe } from "../expat/expat.js";
import { glibRecipe, glibRuntimeDeps } from "../glib/glib.js";
import { libpngRecipe } from "../libpng/libpng.js";
import { libjpegTurboRecipe } from "../libjpeg-turbo/libjpeg-turbo.js";
import { graphiteRecipe } from "../graphene/graphene.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";

// X11 (for xwayland backend)
import { libX11Recipe } from "../libX11/libX11.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXextRecipe } from "../libXext/libXext.js";
import { libXfixesRecipe } from "../libXfixes/libXfixes.js";
import { libXiRecipe } from "../libXi/libXi.js";
import { libXrandrRecipe } from "../libXrandr/libXrandr.js";
import { libXrenderRecipe } from "../libXrender/libXrender.js";
import { libXdamageRecipe } from "../libXdamage/libXdamage.js";
import { libXcompositeRecipe } from "../libXcomposite/libXcomposite.js";
import { libXcursorRecipe } from "../libXcursor/libXcursor.js";
import { libXineramaRecipe } from "../libXinerama/libXinerama.js";
import { libXtstRecipe } from "../libXtst/libXtst.js";
import { libxshmfenceRecipe } from "../libxshmfence/libxshmfence.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { libpthreadStubsRecipe } from "../libpthread-stubs/libpthread-stubs.js";
import { xcbProtoRecipe } from "../xcb-proto/xcb-proto.js";
import { xtransRecipe } from "../xtrans/xtrans.js";

import { cargoBuild } from "../../helpers/rust.js";

const recipe = await cargoBuild({
  name: "cosmic-comp",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  source: "source",
  deps: [
    dep("source", cosmicCompSourceRecipe),

    // TLS certificates for cargo HTTPS
    dep("ca-certs", caCertificatesRecipe),

    // LLVM for linking (libclang headers for potential bindgen)
    dep("llvm", llvmRecipe),

    // Graphics / DRM
    dep("libdrm", libdrmRecipe),
    dep("mesa", mesaRecipe),
    dep("libglvnd", libglvndRecipe),

    // Input
    dep("libinput", libinputRecipe),
    dep("seatd", seatdRecipe),
    dep("libevdev", libevdevRecipe),
    dep("mtdev", mtdevRecipe),

    // Device management
    dep("eudev", eudevRecipe),
    dep("kmod", kmodRecipe),
    dep("util-linux", utilLinuxRecipe),

    // Display
    dep("wayland", waylandRecipe),
    dep("wayland-protocols", waylandProtocolsRecipe),
    dep("libxkbcommon", libxkbcommonRecipe),
    dep("libdisplay-info", libdisplayInfoRecipe),
    dep("hwdata", hwdataRecipe),

    // Rendering
    dep("pixman", pixmanRecipe),

    // Fonts
    dep("fontconfig", fontconfigRecipe),
    dep("freetype", freetypeRecipe),
    dep("harfbuzz", harfbuzzRecipe),
    dep("expat", expatRecipe),
    dep("glib", glibRecipe),
    dep("libpng", libpngRecipe),
    dep("pcre2", pcre2Recipe),
    dep("libffi", libffiRecipe),
    dep("zlib", zlibRecipe),
    dep("bzip2", bzip2Recipe),

    // X11 (for xwayland backend)
    dep("libX11", libX11Recipe),
    dep("libXau", libXauRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("libxcb", libXcbRecipe),
    dep("libXext", libXextRecipe),
    dep("libXfixes", libXfixesRecipe),
    dep("libXi", libXiRecipe),
    dep("libXrandr", libXrandrRecipe),
    dep("libXrender", libXrenderRecipe),
    dep("libXdamage", libXdamageRecipe),
    dep("libXcomposite", libXcompositeRecipe),
    dep("libXcursor", libXcursorRecipe),
    dep("libXinerama", libXineramaRecipe),
    dep("libXtst", libXtstRecipe),
    dep("libxshmfence", libxshmfenceRecipe),
    dep("xorgproto", xorgprotoRecipe),
    dep("libpthread-stubs", libpthreadStubsRecipe),
    dep("xcb-proto", xcbProtoRecipe),
    dep("xtrans", xtransRecipe),
  ],
  env: {
    // TLS certs for cargo HTTPS
    CARGO_HTTP_CAINFO: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",
    SSL_CERT_FILE: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",

    // PKG_CONFIG path — all deps with .pc files
    PKG_CONFIG_PATH: [
      "/deps/libdrm/lib/pkgconfig",
      "/deps/libglvnd/lib/pkgconfig",
      "/deps/libinput/lib/pkgconfig",
      "/deps/seatd/lib/pkgconfig",
      "/deps/libevdev/lib/pkgconfig",
      "/deps/eudev/lib/pkgconfig",
      "/deps/kmod/lib/pkgconfig",
      "/deps/util-linux/lib/pkgconfig",
      "/deps/wayland/lib/pkgconfig",
      "/deps/libxkbcommon/lib/pkgconfig",
      "/deps/libdisplay-info/lib/pkgconfig",
      "/deps/hwdata/share/pkgconfig",
      "/deps/pixman/lib/pkgconfig",
      "/deps/fontconfig/lib/pkgconfig",
      "/deps/freetype/lib/pkgconfig",
      "/deps/harfbuzz/lib/pkgconfig",
      "/deps/expat/lib/pkgconfig",
      "/deps/glib/lib/pkgconfig",
      "/deps/libpng/lib/pkgconfig",
      "/deps/pcre2/lib/pkgconfig",
      "/deps/libffi/lib/pkgconfig",
      "/deps/zlib/lib/pkgconfig",
      "/deps/bzip2/lib/pkgconfig",
      "/deps/libX11/lib/pkgconfig",
      "/deps/libXau/lib/pkgconfig",
      "/deps/libXdmcp/lib/pkgconfig",
      "/deps/libxcb/lib/pkgconfig",
      "/deps/libXext/lib/pkgconfig",
      "/deps/libXfixes/lib/pkgconfig",
      "/deps/libXi/lib/pkgconfig",
      "/deps/libXrandr/lib/pkgconfig",
      "/deps/libXrender/lib/pkgconfig",
      "/deps/libXdamage/lib/pkgconfig",
      "/deps/libXcomposite/lib/pkgconfig",
      "/deps/libXcursor/lib/pkgconfig",
      "/deps/libXinerama/lib/pkgconfig",
      "/deps/libXtst/lib/pkgconfig",
      "/deps/libxshmfence/lib/pkgconfig",
      "/deps/xorgproto/share/pkgconfig",
    ].join(":"),

    // C header search paths
    C_INCLUDE_PATH: [
      "/deps/freetype/include/freetype2",
      "/deps/harfbuzz/include/harfbuzz",
      "/deps/fontconfig/include",
      "/deps/libdrm/include",
      "/deps/libglvnd/include",
      "/deps/wayland/include",
      "/deps/libxkbcommon/include",
      "/deps/pixman/include/pixman-1",
      "/deps/libinput/include",
      "/deps/seatd/include",
      "/deps/libevdev/include",
      "/deps/eudev/include",
      "/deps/glib/include/glib-2.0",
      "/deps/glib/lib/glib-2.0/include",
      "/deps/libpng/include",
      "/deps/pcre2/include",
      "/deps/expat/include",
      "/deps/libffi/include",
      "/deps/libX11/include",
      "/deps/libXau/include",
      "/deps/libxcb/include",
      "/deps/libXext/include",
      "/deps/libXfixes/include",
      "/deps/libXi/include",
      "/deps/libXrandr/include",
      "/deps/libXrender/include",
      "/deps/libXdamage/include",
      "/deps/libXcomposite/include",
      "/deps/libXcursor/include",
      "/deps/libXinerama/include",
      "/deps/libXtst/include",
      "/deps/xorgproto/include",
      "/deps/libxshmfence/include",
    ].join(":"),

    // LD_LIBRARY_PATH for build-time shared lib resolution
    LD_LIBRARY_PATH: [
      "/deps/rust/lib",
      "/deps/toolchain/lib",
      "/deps/libdrm/lib",
      "/deps/libglvnd/lib",
      "/deps/libinput/lib",
      "/deps/seatd/lib",
      "/deps/libevdev/lib",
      "/deps/mtdev/lib",
      "/deps/eudev/lib",
      "/deps/kmod/lib",
      "/deps/util-linux/lib",
      "/deps/wayland/lib",
      "/deps/libxkbcommon/lib",
      "/deps/libdisplay-info/lib",
      "/deps/pixman/lib",
      "/deps/fontconfig/lib",
      "/deps/freetype/lib",
      "/deps/harfbuzz/lib",
      "/deps/expat/lib",
      "/deps/glib/lib",
      "/deps/libpng/lib",
      "/deps/pcre2/lib",
      "/deps/libffi/lib",
      "/deps/zlib/lib",
      "/deps/bzip2/lib",
      "/deps/libX11/lib",
      "/deps/libXau/lib",
      "/deps/libxcb/lib",
      "/deps/libXext/lib",
      "/deps/libXfixes/lib",
      "/deps/libXi/lib",
      "/deps/libXrandr/lib",
      "/deps/libXrender/lib",
      "/deps/libXdamage/lib",
      "/deps/libXcomposite/lib",
      "/deps/libXcursor/lib",
      "/deps/libXinerama/lib",
      "/deps/libXtst/lib",
      "/deps/libxshmfence/lib",
    ].join(":"),

    // LIBRARY_PATH — gcc linker search path for -l libraries.
    // The -sys crates (drm-sys, input-sys, pixman-sys, etc.) use pre-generated
    // bindings and have empty build.rs scripts — they emit cargo:rustc-link-lib
    // but NOT cargo:rustc-link-search. GCC's LIBRARY_PATH fills this gap.
    LIBRARY_PATH: [
      "/deps/toolchain/sysroot/lib",
      "/deps/toolchain/lib",
      "/deps/libdrm/lib",
      "/deps/libglvnd/lib",
      "/deps/libinput/lib",
      "/deps/seatd/lib",
      "/deps/libevdev/lib",
      "/deps/eudev/lib",
      "/deps/kmod/lib",
      "/deps/util-linux/lib",
      "/deps/wayland/lib",
      "/deps/libxkbcommon/lib",
      "/deps/libdisplay-info/lib",
      "/deps/pixman/lib",
      "/deps/fontconfig/lib",
      "/deps/freetype/lib",
      "/deps/harfbuzz/lib",
      "/deps/expat/lib",
      "/deps/glib/lib",
      "/deps/libpng/lib",
      "/deps/pcre2/lib",
      "/deps/libffi/lib",
      "/deps/zlib/lib",
      "/deps/bzip2/lib",
      "/deps/mesa/lib",
      "/deps/libX11/lib",
      "/deps/libXau/lib",
      "/deps/libxcb/lib",
      "/deps/libXext/lib",
      "/deps/libXfixes/lib",
      "/deps/libXi/lib",
      "/deps/libXrandr/lib",
      "/deps/libXrender/lib",
      "/deps/libXdamage/lib",
      "/deps/libXcomposite/lib",
      "/deps/libXcursor/lib",
      "/deps/libXinerama/lib",
      "/deps/libXtst/lib",
      "/deps/libxshmfence/lib",
    ].join(":"),

    // LIBCLANG_PATH for rust bindgen (if any -sys crate needs it)
    LIBCLANG_PATH: "/deps/llvm/lib",

    // wayland-scanner needs to be on PATH
    PATH: "/deps/wayland/bin:/deps/toolchain/bin:/deps/rust/bin",
  },
  cargoFlags: [
    "--no-default-features",  // Disable systemd (use seatd instead)
  ],
  unsafe_flags: 0x01, // Network access for cargo crate downloads
  runtime_deps: [
    "eudev",
    "fontconfig",
    "freetype",
    "libX11",
    "libXcomposite",
    "libXcursor",
    "libXdamage",
    "libXext",
    "libXfixes",
    "libXi",
    "libXrandr",
    "libXrender",
    "libdisplay-info",
    "libdrm",
    "libglvnd",
    "libinput",
    "libxkbcommon",
    "libxshmfence",
    "mesa",
    "pixman",
    "seatd",
    "toolchain",
    "wayland",
  ],
});

await importToStore(recipe);
export const cosmicCompRecipe = recipe;
