//! Shared configuration for building COSMIC desktop components.
//!
//! All COSMIC apps share the same base set of C library dependencies
//! (pulled through libcosmic → cosmic-text → fontconfig/freetype/harfbuzz,
//! plus wayland/libxkbcommon for window management). This helper provides
//! the common dependency list, environment setup, and a thin wrapper around
//! cargoBuild for COSMIC components.
//!
//! Usage:
//!   import { cosmicApp } from "../../helpers/cosmic.js";
//!   const recipe = await cosmicApp({
//!     name: "cosmic-edit",
//!     source: cosmicEditSourceRecipe,
//!     gitCommit: "7bbe82ec3f2b5ebac7f29599cd5c3e6e6f3ccba1",
//!     cargoFlags: ["--no-default-features"],
//!     runtime_deps: [...],
//!   });

import {
  dep,
  importToStore,
} from "../../js/src/index.js";
import type { BuiltRecipe } from "../../js/src/file.js";
import { nativeToolchainRecipe } from "../toolchain/native-toolchain.js";
import { rustRecipe } from "../native/rust/rust.js";
import { cargoBuild } from "./rust.js";

// C toolchain
import { zlibRecipe } from "../native/zlib/zlib.js";
import { caCertificatesRecipe } from "../native/ca-certificates/ca-certificates.js";
import { llvmRecipe } from "../native/llvm/llvm.js";
import { opensslRecipe } from "../native/openssl/openssl.js";

// D-Bus (needed by libcosmic/dbus-config + zbus + libdbus-sys)
import { dbusRecipe } from "../native/dbus/dbus.js";

// Audio (needed by cosmic-applet-audio, cosmic-osd, cosmic-settings-daemon, xdg-desktop-portal-cosmic)
import { alsaLibRecipe } from "../native/alsa-lib/alsa-lib.js";
import { pipewireRecipe } from "../native/pipewire/pipewire.js";
import { pulseaudioRecipe } from "../native/pulseaudio/pulseaudio.js";

// Graphics / DRM (needed by libcosmic/wgpu)
import { libdrmRecipe } from "../native/libdrm/libdrm.js";
import { mesaRecipe } from "../native/mesa/mesa.js";
import { libglvndRecipe } from "../native/libglvnd/libglvnd.js";

// Input (needed by some components via smithay)
import { libinputRecipe } from "../native/libinput/libinput.js";
import { seatdRecipe } from "../native/seatd/seatd.js";
import { libevdevRecipe } from "../native/libevdev/libevdev.js";
import { mtdevRecipe } from "../native/mtdev/mtdev.js";

// Device management
import { eudevRecipe } from "../native/eudev/eudev.js";
import { kmodRecipe } from "../native/kmod/kmod.js";
import { utilLinuxRecipe } from "../native/util-linux/util-linux.js";

// Display
import { waylandRecipe } from "../native/wayland/wayland.js";
import { waylandProtocolsRecipe } from "../native/wayland-protocols/wayland-protocols.js";
import { libxkbcommonRecipe } from "../native/libxkbcommon/libxkbcommon.js";
import { libdisplayInfoRecipe } from "../native/libdisplay-info/libdisplay-info.js";
import { hwdataRecipe } from "../native/hwdata/hwdata.js";

// Rendering
import { pixmanRecipe } from "../native/pixman/pixman.js";

// Fonts (needed by cosmic-text → fontconfig/freetype/harfbuzz)
import { fontconfigRecipe } from "../native/fontconfig/fontconfig.js";
import { freetypeRecipe } from "../native/freetype/freetype.js";
import { harfbuzzRecipe } from "../native/harfbuzz/harfbuzz.js";
import { expatRecipe } from "../native/expat/expat.js";
import { glibRecipe } from "../native/glib/glib.js";
import { libpngRecipe } from "../native/libpng/libpng.js";
import { pcre2Recipe } from "../native/pcre2/pcre2.js";
import { libffiRecipe } from "../native/libffi/libffi.js";
import { bzip2Recipe } from "../native/bzip2/bzip2.js";

// X11 (needed by some components for xwayland/x11 support)
import { libX11Recipe } from "../native/libX11/libX11.js";
import { libXauRecipe } from "../native/libXau/libXau.js";
import { libXdmcpRecipe } from "../native/libXdmcp/libXdmcp.js";
import { libXcbRecipe } from "../native/libxcb/libxcb.js";
import { libXextRecipe } from "../native/libXext/libXext.js";
import { libXfixesRecipe } from "../native/libXfixes/libXfixes.js";
import { libXiRecipe } from "../native/libXi/libXi.js";
import { libXrandrRecipe } from "../native/libXrandr/libXrandr.js";
import { libXrenderRecipe } from "../native/libXrender/libXrender.js";
import { libXdamageRecipe } from "../native/libXdamage/libXdamage.js";
import { libXcompositeRecipe } from "../native/libXcomposite/libXcomposite.js";
import { libXcursorRecipe } from "../native/libXcursor/libXcursor.js";
import { libXineramaRecipe } from "../native/libXinerama/libXinerama.js";
import { libXtstRecipe } from "../native/libXtst/libXtst.js";
import { libxshmfenceRecipe } from "../native/libxshmfence/libxshmfence.js";
import { xorgprotoRecipe } from "../native/xorgproto/xorgproto.js";
import { libpthreadStubsRecipe } from "../native/libpthread-stubs/libpthread-stubs.js";
import { xcbProtoRecipe } from "../native/xcb-proto/xcb-proto.js";
import { xtransRecipe } from "../native/xtrans/xtrans.js";

/**
 * The standard set of C library dependencies shared by all COSMIC components.
 * These are needed because libcosmic/cosmic-text pull in fontconfig/freetype/harfbuzz,
 * wgpu/Smithay pull in DRM/GBM/EGL, and wayland-protocols needs wayland-scanner.
 */
export const cosmicBaseDeps = [
  dep("ca-certs", caCertificatesRecipe),
  dep("llvm", llvmRecipe),
  dep("openssl", opensslRecipe),
  dep("dbus", dbusRecipe),
  dep("alsa", alsaLibRecipe),
  dep("pipewire", pipewireRecipe),
  dep("pulseaudio", pulseaudioRecipe),

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

  // X11
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
];

/**
 * Standard environment variables for COSMIC builds.
 * Sets up PKG_CONFIG_PATH, C_INCLUDE_PATH, LD_LIBRARY_PATH, LIBRARY_PATH.
 */
export const cosmicBaseEnv: Record<string, string> = {
  // TLS certs for cargo HTTPS
  CARGO_HTTP_CAINFO: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",
  SSL_CERT_FILE: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",

  // PKG_CONFIG path — all deps with .pc files
  PKG_CONFIG_PATH: [
    "/deps/dbus/lib/pkgconfig",
    "/deps/openssl/lib/pkgconfig",
    "/deps/alsa/lib/pkgconfig",
    "/deps/pipewire/lib/pkgconfig",
    "/deps/pulseaudio/lib/pkgconfig",
    "/deps/pulseaudio/lib/pulseaudio",
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
    "/deps/dbus/include",
    "/deps/openssl/include",
    "/deps/alsa/include",
    "/deps/pipewire/include",
    "/deps/pipewire/include/spa-0.2",
    "/deps/pulseaudio/include",
    "/deps/pulseaudio/include/pulse",
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
    "/deps/dbus/lib",
    "/deps/openssl/lib",
    "/deps/alsa/lib",
    "/deps/pipewire/lib",
    "/deps/pulseaudio/lib",
    "/deps/pulseaudio/lib/pulseaudio",
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
  // The -sys crates use pre-generated bindings and have empty build.rs scripts.
  LIBRARY_PATH: [
    "/deps/toolchain/sysroot/lib",
    "/deps/toolchain/lib",
    "/deps/dbus/lib",
    "/deps/openssl/lib",
    "/deps/alsa/lib",
    "/deps/pipewire/lib",
    "/deps/pulseaudio/lib",
    "/deps/pulseaudio/lib/pulseaudio",
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
};

/**
 * Standard runtime deps for COSMIC apps that only need the basic
 * fontconfig/freetype/wayland stack (not DRM/input/seat).
 */
export const cosmicBaseRuntimeDeps = [
  "alsa",
  "dbus",
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
  "openssl",
  "pixman",
  "pipewire",
  "pulseaudio",
  "seatd",
  "toolchain",
  "wayland",
];

export interface CosmicAppOptions {
  /** Binary name. */
  name: string;

  /** Source recipe (from fetchGit). */
  source: BuiltRecipe;

  /** Additional deps beyond the cosmic base deps. */
  extraDeps?: ReturnType<typeof dep>[];

  /** Additional runtime deps beyond the base set. */
  extraRuntimeDeps?: string[];

  /** Cargo flags. Defaults to ["--no-default-features"]. */
  cargoFlags?: string[];

  /** Additional env vars to merge over the cosmic base env. */
  extraEnv?: Record<string, string>;

  /** Extra binaries to install beyond the main name. */
  extraBinaries?: string[];

  /** Shell commands to run after source extraction but before `cargo build`. */
  preBuildScript?: string;
}

/**
 * Build a COSMIC desktop component from source.
 *
 * Provides all the standard C library deps that COSMIC apps need
 * (fontconfig/freetype/harfbuzz, wayland, libxkbcommon, DRM/EGL stack, etc.)
 * and configures the build environment accordingly.
 */
export async function cosmicApp(opts: CosmicAppOptions): Promise<BuiltRecipe> {
  const recipe = await cargoBuild({
    name: opts.name,
    toolchain: nativeToolchainRecipe,
    rustToolchain: rustRecipe,
    source: "source",
    deps: [
      dep("source", opts.source),
      ...cosmicBaseDeps,
      ...(opts.extraDeps ?? []),
    ],
    env: {
      ...cosmicBaseEnv,
      ...(opts.extraEnv ?? {}),
    },
    cargoFlags: opts.cargoFlags ?? ["--no-default-features"],
    unsafe_flags: 0x01, // Network access for cargo crate downloads
    runtime_deps: [
      ...cosmicBaseRuntimeDeps,
      ...(opts.extraRuntimeDeps ?? []),
    ].sort(),
    extraBinaries: opts.extraBinaries,
    preBuildScript: opts.preBuildScript,
  });

  await importToStore(recipe);
  return recipe;
}
