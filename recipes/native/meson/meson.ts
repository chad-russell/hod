//! Meson build recipe — the Meson build system.
//!
//! Installs Meson 1.8.0 as a runnable Python application.
//!
//! Approach: copy the mesonbuild/ Python package and meson.py entry point
//! into the output directory. Create a bin/meson wrapper that sets PYTHONPATH
//! and runs python3 meson.py.
//!
//! Meson is a build tool only needed at build time. Other recipes declare
//! dep("meson", mesonRecipe) and invoke meson via the mesonProfile() helper.

import { shellBuild, dep, importToStore, hermeticPreamble, pathList, depSubpath } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { mesonSourceRecipe } from "./meson-source.js";
import { pythonRecipe } from "../python/python.js";
import { zlibRecipe } from "../zlib/zlib.js";

const recipe = await shellBuild({
  shell: "/deps/toolchain/bin/busybox",
  preamble: hermeticPreamble({ shell: "toolchain", glibcLinker: "toolchain" }),
  env: {
    PATH: "/deps/toolchain/bin:/deps/python/bin",
    LD_LIBRARY_PATH: pathList([depSubpath("zlib", "lib")]),
  },
  script: `

# Copy mesonbuild package and entry point into output
mkdir -p $OUT/lib/meson $OUT/bin

cp -a /deps/source/mesonbuild $OUT/lib/meson/mesonbuild
cp /deps/source/meson.py $OUT/lib/meson/meson.py

# Create bin/meson wrapper that runs meson.py with the right PYTHONPATH.
# Uses $0 to find its own location, then walks up to find lib/meson/meson.py.
# Works both at build time ($OUT/bin/meson) and as a dep (/deps/meson/bin/meson).
cat > $OUT/bin/meson << 'WRAPPER'
#!/bin/sh
MESON_DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec /deps/python/bin/python3 "$MESON_DIR/lib/meson/meson.py" "$@"
WRAPPER
chmod +x $OUT/bin/meson

# Verify meson runs (needs python accessible at /deps/python)
$OUT/bin/meson --version
`,
  deps: [
    dep("source", mesonSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("python", pythonRecipe),
    dep("zlib", zlibRecipe),
  ],
});

await importToStore(recipe);
export const mesonRecipe = recipe;
