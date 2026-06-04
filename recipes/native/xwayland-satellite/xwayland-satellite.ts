//! xwayland-satellite — rootless Xwayland integration for Wayland compositors.
//!
//! Builds xwayland-satellite 0.8.1 from source. This recipe currently packages
//! the Rust satellite binary and its XCB library dependencies; the Xwayland
//! server binary itself is still expected to come from the host until an
//! xorg-server/Xwayland recipe lands.

import { dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust/rust.js";
import { caCertificatesRecipe } from "../ca-certificates/ca-certificates.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { bindgenClangRecipe } from "../llvm/bindgen-clang.js";
import { libXcbRecipe } from "../libxcb/libxcb.js";
import { libXauRecipe } from "../libXau/libXau.js";
import { libXdmcpRecipe } from "../libXdmcp/libXdmcp.js";
import { libpthreadStubsRecipe } from "../libpthread-stubs/libpthread-stubs.js";
import { xcbUtilCursorRecipe } from "../xcb-util-cursor/xcb-util-cursor.js";
import { xcbUtilImageRecipe } from "../xcb-util-image/xcb-util-image.js";
import { xcbUtilRenderutilRecipe } from "../xcb-util-renderutil/xcb-util-renderutil.js";
import { xcbUtilRecipe } from "../xcb-util/xcb-util.js";
import { xorgprotoRecipe } from "../xorgproto/xorgproto.js";
import { xwaylandSatelliteSourceRecipe } from "./xwayland-satellite-source.js";
import { cargoBuild } from "../../helpers/rust.js";
import { caCertEnv, depEnvFromList } from "../../helpers/build-env.js";

const recipe = await cargoBuild({
  name: "xwayland-satellite",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  source: "source",
  deps: [
    dep("source", xwaylandSatelliteSourceRecipe),
    dep("ca-certs", caCertificatesRecipe),
    dep("zlib", zlibRecipe),
    dep("bindgen-clang", bindgenClangRecipe),
    dep("libXau", libXauRecipe),
    dep("libXcb", libXcbRecipe),
    dep("libXdmcp", libXdmcpRecipe),
    dep("libpthread-stubs", libpthreadStubsRecipe),
    dep("xcb-util", xcbUtilRecipe),
    dep("xcb-util-cursor", xcbUtilCursorRecipe),
    dep("xcb-util-image", xcbUtilImageRecipe),
    dep("xcb-util-renderutil", xcbUtilRenderutilRecipe),
    dep("xorgproto", xorgprotoRecipe),
  ],
  env: {
    ...caCertEnv(),
    ...depEnvFromList(["zlib", "libXcb", "xcb-util-cursor", "xcb-util-image", "xcb-util-renderutil", "xcb-util", "libXau", "libXdmcp", "libpthread-stubs", "xorgproto"]),
  },
  bindgen: true,
  unsafe_flags: 0x01,
  runtime_deps: [
    "libXau",
    "libXcb",
    "libXdmcp",
    "toolchain",
    "xcb-util",
    "xcb-util-cursor",
    "xcb-util-image",
    "xcb-util-renderutil",
  ],
});

await importToStore(recipe);
export const xwaylandSatelliteRecipe = recipe;
