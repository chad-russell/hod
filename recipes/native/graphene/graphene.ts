//! graphene build recipe — thin layer of graphic data types.
//!
//! Builds Graphene 1.10.8 with GObject types enabled (required by GTK4).
//! Dependencies: glib, toolchain, meson, ninja, python.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { grapheneSourceRecipe } from "./graphene-source.js";
import { glibRecipe } from "../glib/glib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const grapheneRuntimeDeps = ["glib", "libffi", "pcre2", "toolchain", "zlib"];

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    includeDeps: ["glib", "libffi", "pcre2", "zlib"],
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
  -Dgobject_types=true \\
  -Dintrospection=disabled \\
  -Dtests=false \\
  -Dgtk_doc=false \\
  -Dinstalled_tests=false

ninja -C build
DESTDIR=$OUT ninja -C build install

${RELOCATE_PKG_CONFIG}

${STRIP_ALL}
`,
  deps: [
    dep("source", grapheneSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("glib", glibRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("zlib", zlibRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: grapheneRuntimeDeps,
});

await importToStore(recipe);
export const grapheneRecipe = recipe;
