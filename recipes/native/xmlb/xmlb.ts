//! xmlb build recipe — library for querying XML files.
//!
//! Builds libxmlb 0.3.21. Dependencies: glib (and its transitive deps).
//! Required by appstream.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { xmlbSourceRecipe } from "./xmlb-source.js";
import { glibRecipe } from "../glib/glib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const xmlbRuntimeDeps = ["glib", "libffi", "pcre2", "toolchain", "zlib"];

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    includeDeps: ["glib", "libffi", "pcre2", "zlib"],
    includePaths: ["/deps/glib/include/glib-2.0", "/deps/glib/lib/glib-2.0/include"],
    libDeps: ["glib", "libffi", "pcre2", "zlib"],
    pkgConfigDeps: ["glib", "libffi", "pcre2", "zlib"],
  }),
  sourceDir: true,
  script: `

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Ddefault_library=shared \\
  -Dgtkdoc=false \\
  -Dintrospection=false \\
  -Dtests=false \\
  -Dstemmer=false \\
  -Dlzma=disabled \\
  -Dzstd=disabled

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", xmlbSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("glib", glibRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("zlib", zlibRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: xmlbRuntimeDeps,
});

await importToStore(recipe);
export const xmlbRecipe = recipe;
