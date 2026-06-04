//! util-linux build recipe — system utilities and libraries.
//!
//! Builds util-linux 2.42.1, providing core system libraries:
//! - libblkid — block device identification
//! - libuuid — UUID generation
//! - libmount — mount information
//!
//! These libraries are needed by eudev (which needs libblkid) and
//! other system components.
//!
//! We build only the libraries and disable all utilities/programs.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { utilLinuxSourceRecipe } from "./util-linux-source.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { bisonRecipe } from "../bison/bison.js";
import { flexRecipe } from "../flex/flex.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const utilLinuxRuntimeDeps = ["toolchain"];

const recipe = await shellBuild({
  ...mesonProfile({ python: "python", binDeps: ["bison", "flex"] }),
  sourceDir: true,
  script: `

export LD_LIBRARY_PATH="/deps/zlib/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

# Only build the three libraries, disable everything else.
# Keep the line continuations consistent (all backslash-backslash).
meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Dbuild-libblkid=enabled \\
  -Dbuild-libuuid=enabled \\
  -Dbuild-libmount=enabled \\
  -Dbuild-libsmartcols=disabled \\
  -Dbuild-libfdisk=disabled \\
  -Dbuild-liblastlog2=disabled \\
  -Dncursesw=disabled \\
  -Dncurses=disabled \\
  -Dtinfo=disabled \\
  -Dreadline=disabled \\
  -Daudit=disabled \\
  -Dselinux=disabled \\
  -Dsmack=disabled \\
  -Dsystemd=disabled \\
  -Dcryptsetup=disabled \\
  -Dnls=disabled \\
  -Dbtrfs=disabled \\
  -Dbuild-python=disabled \\
  -Dbuild-lsfd=disabled \\
  -Dbuild-enosys=disabled \\
  -Dbuild-hwclock=disabled \\
  -Dbuild-newgrp=disabled \\
  -Dbuild-login=disabled \\
  -Dbuild-su=disabled \\
  -Dbuild-sulogin=disabled \\
  -Dbuild-runuser=disabled \\
  -Dbuild-wall=disabled \\
  -Dbuild-write=disabled \\
  -Dbuild-schedutils=disabled \\
  -Dbuild-bash-completion=disabled \\
  -Dbuild-agetty=disabled \\
  -Dbuild-fstrim=disabled

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", utilLinuxSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
    dep("zlib", zlibRecipe),
    dep("bison", bisonRecipe),
    dep("flex", flexRecipe),
  ],
  runtime_deps: utilLinuxRuntimeDeps,
});

await importToStore(recipe);
export const utilLinuxRecipe = recipe;
