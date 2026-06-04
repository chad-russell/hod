//! gsettings-desktop-schemas build recipe — GNOME desktop GSettings schemas.
//!
//! Builds gsettings-desktop-schemas 48.0. A data-only package that provides
//! GSettings schema XML files for GNOME desktop configuration.
//! Dependencies: glib (for glib-mkenums, glib-compile-schemas).
//!
//! Notes:
//! - capture: true custom_target uses meson's internal exe helper, which may
//!   fail in the sandbox. If it does, pre-generate the enum XML and patch.
//! - subdir('po') needs gettext — patched out.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { gsettingsDesktopSchemasSourceRecipe } from "./gsettings-desktop-schemas-source.js";
import { glibRecipe } from "../glib/glib.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { pcre2Recipe } from "../pcre2/pcre2.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    binDeps: ["glib"],
    pkgConfigDeps: ["glib", "libffi", "pcre2", "zlib"],
    includeDeps: ["glib", "libffi", "pcre2"],
    includePaths: [
      "/deps/glib/include/glib-2.0",
      "/deps/glib/lib/glib-2.0/include",
    ],
    libDeps: ["glib", "libffi", "pcre2", "zlib"],
  }),
  sourceDir: true,
  script: `
# Patch out po/ subdir (needs gettext)
sed -i "/subdir('po')/d" meson.build

# Patch out gnome.post_install which tries to run glib-compile-schemas
# at install time. We'll compile schemas manually.
sed -i '/gnome.post_install/,/)/d' meson.build

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Dintrospection=false

ninja -C build
DESTDIR=$OUT ninja -C build install

# Compile the schemas ourselves
/deps/glib/bin/glib-compile-schemas $OUT/share/glib-2.0/schemas/
`,
  deps: [
    dep("source", gsettingsDesktopSchemasSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("glib", glibRecipe),
    dep("libffi", libffiRecipe),
    dep("pcre2", pcre2Recipe),
    dep("zlib", zlibRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: ["glib", "toolchain"],
});

await importToStore(recipe);
export const gsettingsDesktopSchemasRecipe = recipe;
