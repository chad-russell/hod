//! xkeyboard-config build recipe — X Keyboard configuration data.
//!
//! Builds xkeyboard-config 2.43. A data-only package providing XKB
//! keyboard layout data and a pkg-config file.
//!
//! Dependencies: python3 at build time for rule generation scripts.
//! Also needs python's full runtime dep chain (zlib, openssl, libffi, expat,
//! ncurses, bzip2, xz) on LD_LIBRARY_PATH so that meson can spawn python3
//! subprocesses for capture: true targets.
//!
//! Notes:
//! - Uses capture: true custom_targets that invoke Python via meson's
//!   internal executor. Relies on the cProfile python wrapper setup.
//! - subdir('po') needs gettext — patched out.
//! - compat-rules disabled to avoid run_command issues.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { xkeyboardConfigSourceRecipe } from "./xkeyboard-config-source.js";
import { pythonRecipe } from "../python/python.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { expatRecipe } from "../expat/expat.js";
import { ncursesRecipe } from "../ncurses/ncurses.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { xzRecipe } from "../xz/xz.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { mesonProfile } from "../../helpers/meson.js";

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    binDeps: ["python"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# Python links against zlib, openssl, libffi, expat, ncurses, bzip2, xz.
# Set LD_LIBRARY_PATH so meson's internal executor can spawn python3
# for capture: true targets.
export LD_LIBRARY_PATH="/deps/zlib/lib:/deps/openssl/lib:/deps/libffi/lib:/deps/expat/lib:/deps/ncurses/lib:/deps/readline/lib:/deps/bzip2/lib:/deps/xz/lib"

# Patch out po/ subdir (needs gettext)
sed -i "/subdir('po')/d" meson.build

# Patch out xml2lst.lst generation — needs perl which isn't in the sandbox.
# The .lst files are optional text listings, not needed by consumers.
sed -i '/xml2lst = find_program/d' rules/meson.build
sed -i '/# Fourth: generate the/,/install_dir: dir_xkb_rules)/d' rules/meson.build

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Dcompat-rules=false \\
  -Dnls=false \\
  -Dxorg-rules-symlinks=false

ninja -C build
DESTDIR=$OUT ninja -C build install

# Make pkg-config file relocatable. The xkeyboard-config .pc file uses
# datadir and xkb_base directly (no prefix). Fix both.
for pc in $OUT/share/pkgconfig/*.pc $OUT/lib/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) pcdir='\${pcfiledir}/../..' ;;
    */lib/pkgconfig/*)   pcdir='\${pcfiledir}/../..' ;;
  esac
  # Replace hardcoded /share paths with pcfiledir-relative ones
  sed -i "s|^datadir=.*|datadir=\${pcdir}/share|" "$pc"
  sed -i "s|^xkb_base=.*|xkb_base=\${pcdir}/share/X11/xkb|" "$pc"
done
`,
  deps: [
    dep("source", xkeyboardConfigSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("python", pythonRecipe),
    dep("zlib", zlibRecipe),
    dep("openssl", opensslRecipe),
    dep("libffi", libffiRecipe),
    dep("expat", expatRecipe),
    dep("ncurses", ncursesRecipe),
    dep("bzip2", bzip2Recipe),
    dep("xz", xzRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
  ],
  runtime_deps: [],
});

await importToStore(recipe);
export const xkeyboardConfigRecipe = recipe;
