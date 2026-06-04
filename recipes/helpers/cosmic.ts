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
import { caCertEnv, depEnvFromList } from "./build-env.js";
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
import { xkeyboardConfigRecipe } from "../native/xkeyboard-config/xkeyboard-config.js";

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
  dep("xkeyboard-config", xkeyboardConfigRecipe),
];

/**
 * Standard environment variables for COSMIC builds.
 * Sets up PKG_CONFIG_PATH, C_INCLUDE_PATH, LD_LIBRARY_PATH, LIBRARY_PATH.
 */
const cosmicCDepNames = [
  "dbus",
  "openssl",
  "alsa",
  { name: "pipewire", extraIncludes: ["include/spa-0.2"] },
  { name: "pulseaudio", extraIncludes: ["include/pulse"], extraLibs: ["lib/pulseaudio"] },
  "libdrm",
  "libglvnd",
  "libinput",
  "seatd",
  "libevdev",
  "eudev",
  "kmod",
  "util-linux",
  "wayland",
  "libxkbcommon",
  "libdisplay-info",
  { name: "hwdata" },
  { name: "pixman", extraIncludes: ["include/pixman-1"] },
  "fontconfig",
  { name: "freetype", extraIncludes: ["include/freetype2"] },
  { name: "harfbuzz", extraIncludes: ["include/harfbuzz"] },
  "expat",
  { name: "glib", extraIncludes: ["include/glib-2.0", "lib/glib-2.0/include"] },
  "libpng",
  "pcre2",
  "libffi",
  "zlib",
  "bzip2",
  "libX11",
  "libXau",
  "libXdmcp",
  "libxcb",
  "libXext",
  "libXfixes",
  "libXi",
  "libXrandr",
  "libXrender",
  "libXdamage",
  "libXcomposite",
  "libXcursor",
  "libXinerama",
  "libXtst",
  "libxshmfence",
  { name: "xorgproto" },
  { name: "xkeyboard-config" },
];

export const cosmicBaseEnv: Record<string, string> = {
  ...caCertEnv(),
  ...depEnvFromList(cosmicCDepNames),
  LIBCLANG_PATH: "/deps/llvm/lib",
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
  "xkeyboard-config",
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

  /** Shell commands to run after binaries are copied into $OUT/bin. */
  postInstallScript?: string;

  /**
   * Enable bindgen support for -sys crates that generate bindings at build time.
   * Adds bindgen-clang dep and sets LIBCLANG_PATH + BINDGEN_EXTRA_CLANG_ARGS.
   */
  bindgen?: boolean;
}

/**
 * Build a COSMIC desktop component from source.
 *
 * Provides all the standard C library deps that COSMIC apps need
 * (fontconfig/freetype/harfbuzz, wayland, libxkbcommon, DRM/EGL stack, etc.)
 * and configures the build environment accordingly.
 */
export async function cosmicApp(opts: CosmicAppOptions): Promise<BuiltRecipe> {
  // When bindgen is requested, add the source-built libclang dep
  const bindgenDeps = opts.bindgen
    ? [dep("bindgen-clang", (await import("../native/llvm/bindgen-clang.js")).bindgenClangRecipe)]
    : [];

  const postInstallScript = [
    `
if [ -d /tmp/build/data/default_schema ]; then
  mkdir -p $OUT/share/cosmic
  cp -a /tmp/build/data/default_schema/. $OUT/share/cosmic/
  for _hod_panel in \
    $OUT/share/cosmic/com.system76.CosmicPanel.Panel/v1 \
    $OUT/share/cosmic/com.system76.CosmicPanel.Dock/v1; do
    [ -d "$_hod_panel" ] || continue
    [ -e "$_hod_panel/padding_overlap" ] || printf '0\n' > "$_hod_panel/padding_overlap"
  done
  unset _hod_panel
  if [ -d $OUT/share/cosmic/com.system76.CosmicPanel.Panel/v1 ]; then
    printf 'S\n' > $OUT/share/cosmic/com.system76.CosmicPanel.Panel/v1/size
    printf 'Some(["com.system76.CosmicAppletTime"])\n' > $OUT/share/cosmic/com.system76.CosmicPanel.Panel/v1/plugins_center
    printf 'None\n' > $OUT/share/cosmic/com.system76.CosmicPanel.Panel/v1/plugins_wings
  fi
  if [ -d $OUT/share/cosmic/com.system76.CosmicPanel.Dock/v1 ]; then
    printf 'M\n' > $OUT/share/cosmic/com.system76.CosmicPanel.Dock/v1/size
    printf 'Some(["com.system76.CosmicPanelLauncherButton", "com.system76.CosmicPanelAppButton", "com.system76.CosmicAppletMinimize"])\n' > $OUT/share/cosmic/com.system76.CosmicPanel.Dock/v1/plugins_center
    printf 'None\n' > $OUT/share/cosmic/com.system76.CosmicPanel.Dock/v1/plugins_wings
  fi
fi
`,
    opts.postInstallScript,
  ].filter(Boolean).join("\n");

  const recipe = await cargoBuild({
    name: opts.name,
    toolchain: nativeToolchainRecipe,
    rustToolchain: rustRecipe,
    source: "source",
    deps: [
      dep("source", opts.source),
      ...cosmicBaseDeps,
      ...(opts.extraDeps ?? []),
      ...bindgenDeps,
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
    postInstallScript,
    bindgen: opts.bindgen,
  });

  await importToStore(recipe);
  return recipe;
}
