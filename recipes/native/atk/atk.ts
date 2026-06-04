//! atk build recipe — accessibility toolkit.
//!
//! Builds ATK 2.38.0 with GLib, without introspection or docs.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { atkSourceRecipe } from "./atk-source.js";
import { glibRecipe } from "../glib/glib.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { expatRecipe } from "../expat/expat.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { RELOCATE_PKG_CONFIG, STRIP_ALL } from "../../helpers/strip.js";

export const atkRuntimeDeps = ["glib", "libffi", "pcre2", "toolchain", "zlib"];

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    includeDeps: ["glib", "zlib", "libffi", "pcre2"],
    libDeps: ["glib", "zlib", "libffi", "pcre2"],
    pkgConfigDeps: ["glib", "zlib", "libffi", "pcre2"],
  }),
  sourceDir: true,
  script: `
export LD_LIBRARY_PATH="/deps/zlib/lib:/deps/expat/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export LDFLAGS="$HOD_DUMMY_RPATH \
  -Wl,-rpath-link,/deps/glib/lib -Wl,-rpath-link,/deps/zlib/lib \
  -Wl,-rpath-link,/deps/libffi/lib -Wl,-rpath-link,/deps/pcre2/lib"

meson setup build \
  --prefix=/ \
  --libdir=lib \
  --buildtype=release \
  -Ddefault_library=shared \
  -Dintrospection=false \
  -Ddocs=false

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", atkSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("glib", glibRecipe),
    dep("zlib", zlibRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("expat", expatRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: atkRuntimeDeps,
});

await importToStore(recipe);
export const atkRecipe = recipe;
