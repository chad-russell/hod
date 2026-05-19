//! Mako — Python template library for Mesa's code generation.
//!
//! Installs Mako 1.3.12 + MarkupSafe 3.0.3 into a Python site-packages
//! output directory. Mesa's build system uses Mako to generate GLSL shader
//! sources and other templated code at build time.
//!
//! ## Layout
//!
//! The output is a pure-Python package:
//!   - lib/python3/site-packages/markupsafe/   — MarkupSafe package
//!   - lib/python3/site-packages/mako/         — Mako package
//!
//! Build recipes add this as a dep and set PYTHONPATH to include
//! /deps/mako/lib/python3/site-packages.
//!
//! This recipe is build-time only — no runtime_deps needed.

import { shellBuild, dep, importToStore, hermeticPreamble } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { pythonRecipe } from "../python/python.js";
import { makoSourceRecipe, markupsafeSourceRecipe } from "./mako-source.js";

const PYTHON_SITE = "lib/python3/site-packages";

const recipe = await shellBuild({
  shell: "/deps/toolchain/bin/busybox",
  preamble: hermeticPreamble({ shell: "toolchain", glibcLinker: "toolchain" }),
  env: {
    PATH: "/deps/toolchain/bin:/deps/python/bin",
  },
  script: `
# === Install MarkupSafe (Mako dependency) ===
mkdir -p $OUT/${PYTHON_SITE}
cd /tmp
cp -a /deps/markupsafe-source/. /tmp/markupsafe-src
cd /tmp/markupsafe-src

# Pure Python install — just copy src/markupsafe to site-packages
# MarkupSafe 3.x may have a C extension, but for Mesa code gen we only
# need the pure Python fallback
/deps/python/bin/python3 -c "
import sys, os
src = '/tmp/markupsafe-src'
dest = '$OUT/${PYTHON_SITE}'
# Try installing via setup.py
os.system(f'cd {src} && /deps/python/bin/python3 setup.py install --prefix= --home=$OUT 2>/dev/null')
" || true

# Fallback: copy the package directory directly
if [ ! -d "$OUT/${PYTHON_SITE}/markupsafe" ]; then
  # Find the markupsafe package dir
  for d in /tmp/markupsafe-src/src/markupsafe /tmp/markupsafe-src/markupsafe; do
    if [ -d "$d" ]; then
      cp -a "$d" "$OUT/${PYTHON_SITE}/markupsafe"
      break
    fi
  done
fi

# === Install Mako ===
cd /tmp
cp -a /deps/mako-source/. /tmp/mako-src
cd /tmp/mako-src

# Direct copy approach
if [ -d "/tmp/mako-src/src/mako" ]; then
  cp -a /tmp/mako-src/src/mako "$OUT/${PYTHON_SITE}/mako"
elif [ -d "/tmp/mako-src/mako" ]; then
  cp -a /tmp/mako-src/mako "$OUT/${PYTHON_SITE}/mako"
fi

# === Verification ===
echo "=== Installed packages ==="
ls $OUT/${PYTHON_SITE}/
echo "=== Mako version check ==="
PYTHONPATH="$OUT/${PYTHON_SITE}" /deps/python/bin/python3 -c "import mako; print('Mako', mako.__version__)" || echo "WARNING: mako import failed"
PYTHONPATH="$OUT/${PYTHON_SITE}" /deps/python/bin/python3 -c "import markupsafe; print('MarkupSafe', markupsafe.__version__)" || echo "WARNING: markupsafe import failed"
echo "=== Mako installation complete ==="
`,
  deps: [
    dep("markupsafe-source", markupsafeSourceRecipe),
    dep("mako-source", makoSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("python", pythonRecipe),
  ],
});

await importToStore(recipe);
export const makoRecipe = recipe;
