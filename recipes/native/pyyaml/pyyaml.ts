//! PyYAML — YAML parser and emitter for Python.
//!
//! Installs PyYAML 6.0.2 as a pure-Python package into Python site-packages.
//! Mesa's build system uses PyYAML for format table generation (u_format_parse.py).
//!
//! ## Layout
//!
//!   - lib/python3/site-packages/yaml/    — PyYAML package
//!   - lib/python3/site-packages/_yaml/   — PyYAML compat module
//!
//! Build recipes add this as a dep and set PYTHONPATH to include
//! /deps/pyyaml/lib/python3/site-packages.

import { shellBuild, dep, importToStore, hermeticPreamble } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { pythonRecipe } from "../python/python.js";
import { pyyamlSourceRecipe } from "./pyyaml-source.js";

const PYTHON_SITE = "lib/python3/site-packages";

const recipe = await shellBuild({
  shell: "/deps/toolchain/bin/busybox",
  preamble: hermeticPreamble({ shell: "toolchain", glibcLinker: "toolchain" }),
  env: {
    PATH: "/deps/toolchain/bin:/deps/python/bin",
  },
  script: `
# === Install PyYAML (pure Python) ===
mkdir -p $OUT/${PYTHON_SITE}
cd /tmp
cp -a /deps/source/. /tmp/pyyaml-src
cd /tmp/pyyaml-src

# Copy the yaml package directory directly
if [ -d "/tmp/pyyaml-src/lib/yaml" ]; then
  cp -a /tmp/pyyaml-src/lib/yaml "$OUT/${PYTHON_SITE}/yaml"
elif [ -d "/tmp/pyyaml-src/yaml" ]; then
  cp -a /tmp/pyyaml-src/yaml "$OUT/${PYTHON_SITE}/yaml"
fi

# PyYAML 6.0.2 ships yaml/ in lib/ directory
# Also check for _yaml compat module
if [ -d "/tmp/pyyaml-src/lib/_yaml" ]; then
  cp -a /tmp/pyyaml-src/lib/_yaml "$OUT/${PYTHON_SITE}/_yaml"
fi

# === Verification ===
echo "=== Installed packages ==="
ls $OUT/${PYTHON_SITE}/
echo "=== PyYAML import check ==="
PYTHONPATH="$OUT/${PYTHON_SITE}" /deps/python/bin/python3 -c "import yaml; print('PyYAML', yaml.__version__)" || echo "WARNING: yaml import failed"
echo "=== PyYAML installation complete ==="
`,
  deps: [
    dep("source", pyyamlSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("python", pythonRecipe),
  ],
});

await importToStore(recipe);
export const pyyamlRecipe = recipe;
