//! wayland native build recipe — core Wayland protocol library and scanner.
//!
//! Builds Wayland 1.25.0 with shared libraries (libwayland-client, libwayland-server)
//! and the wayland-scanner tool. Dependencies: expat, libffi (all built).
//!
//! Produces:
//!   - wayland-scanner (build-time tool for generating protocol glue code)
//!   - libwayland-client.so (client-side Wayland library)
//!   - libwayland-server.so (server/compositor-side Wayland library)
//!   - Headers, pkg-config files, and wayland.xml protocol definition

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { waylandSourceRecipe } from "./wayland-source.js";
import { expatRecipe } from "../expat/expat.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL } from "../../helpers/strip.js";

export const waylandRuntimeDeps = ["expat", "libffi", "toolchain"];

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    includeDeps: ["expat", "libffi", "zlib"],
    libDeps: ["expat", "libffi", "zlib"],
    pkgConfigDeps: ["expat", "libffi", "zlib"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

meson setup build \\
  --prefix=/ \\
  --libdir=lib \\
  --buildtype=release \\
  -Dlibraries=true \\
  -Dscanner=true \\
  -Dtests=false \\
  -Ddocumentation=false \\
  -Ddtd_validation=false

# wayland-scanner is built and executed during the build.
# It links libexpat.so but RUNPATH is still the dummy placeholder,
# so we need LD_LIBRARY_PATH for build-time execution.
export LD_LIBRARY_PATH="/deps/expat/lib:/deps/libffi/lib:/deps/zlib/lib"

ninja -C build
DESTDIR=$OUT ninja -C build install

# Make pkg-config files relocatable via pcfiledir (pkgconf extension).
for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  case "$pc" in
    */share/pkgconfig/*) sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
    */lib/pkgconfig/*)   sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc" ;;
  esac
done

# Strip binaries
find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true
${STRIP_ALL}

# Clean up — keep pkgconfig, aclocal, protocol data, headers
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true
`,
  deps: [
    dep("source", waylandSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("expat", expatRecipe),
    dep("libffi", libffiRecipe),
    dep("zlib", zlibRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: waylandRuntimeDeps,
});

await importToStore(recipe);
export const waylandRecipe = recipe;
