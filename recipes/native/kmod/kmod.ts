//! kmod build recipe — Linux kernel module management library.
//!
//! Builds kmod 34, providing libkmod for loading and managing kernel modules.
//! Required by eudev for module loading.
//!
//! We build only the library (libkmod), not the CLI tools.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { kmodSourceRecipe } from "./kmod-source.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { zstdRecipe } from "../zstd/zstd.js";
import { xzRecipe } from "../xz/xz.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL } from "../../helpers/strip.js";

export const kmodRuntimeDeps = ["openssl", "toolchain", "xz", "zlib", "zstd"];

const recipe = await shellBuild({
  ...mesonProfile({
    pkgConfigDeps: ["zlib", "zstd", "xz", "openssl"],
    includeDeps: ["zlib", "zstd", "xz", "openssl"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Dtools=false \\
  -Dmanpages=false \\
  -Ddocs=false \\
  -Dbuild-tests=false

ninja -C build
DESTDIR=$OUT ninja -C build install

# Make pkg-config files relocatable
for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  sed -i 's|^prefix=.*|prefix=\\\${pcfiledir}/../..|' "$pc"
done

${STRIP_ALL}
`,
  deps: [
    dep("source", kmodSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
    dep("zlib", zlibRecipe),
    dep("zstd", zstdRecipe),
    dep("xz", xzRecipe),
    dep("openssl", opensslRecipe),
  ],
  runtime_deps: kmodRuntimeDeps,
});

await importToStore(recipe);
export const kmodRecipe = recipe;
