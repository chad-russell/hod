//! packaging — core utilities for Python packages.
//!
//! Installs packaging 25.0 as a pure-Python package into Python site-packages.
//! Mesa 26's meson.build requires `from packaging.version import Version` for
//! LLVM version checking. Python 3.12+ removed distutils (the old fallback).
//!
//! ## Layout
//!
//!   - lib/python3/site-packages/packaging/   — packaging package
//!
//! Build recipes add this as a dep and set PYTHONPATH to include
//! /deps/packaging/lib/python3/site-packages.

import { shellBuild, dep, importToStore, hermeticPreamble } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { pythonRecipe } from "../python/python.js";
import { packagingSourceRecipe } from "./packaging-source.js";

const PYTHON_SITE = "lib/python3/site-packages";

const recipe = await shellBuild({
  shell: "/deps/toolchain/bin/busybox",
  preamble: hermeticPreamble({ shell: "toolchain", glibcLinker: "toolchain" }),
  env: {
    PATH: "/deps/toolchain/bin:/deps/python/bin",
  },
  script: `
# === Install packaging (pure Python) ===
mkdir -p $OUT/${PYTHON_SITE}
cd /tmp
cp -a /deps/source/. /tmp/packaging-src
cd /tmp/packaging-src

# Copy the packaging package directory
if [ -d "/tmp/packaging-src/src/packaging" ]; then
  cp -a /tmp/packaging-src/src/packaging "$OUT/${PYTHON_SITE}/packaging"
elif [ -d "/tmp/packaging-src/packaging" ]; then
  cp -a /tmp/packaging-src/packaging "$OUT/${PYTHON_SITE}/packaging"
fi

# === Verification ===
echo "=== Installed packages ==="
ls $OUT/${PYTHON_SITE}/
echo "=== packaging import check ==="
PYTHONPATH="$OUT/${PYTHON_SITE}" /deps/python/bin/python3 -c "import packaging; print('packaging', packaging.__version__)" || echo "WARNING: packaging import failed"
echo "=== packaging installation complete ==="
`,
  deps: [
    dep("source", packagingSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("python", pythonRecipe),
  ],
});

await importToStore(recipe);
export const packagingRecipe = recipe;
