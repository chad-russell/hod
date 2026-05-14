//! Go toolchain — prebuilt binary installation.
//!
//! Installs the official Go 1.26.3 prebuilt binaries. The Go toolchain is
//! fully statically linked (no glibc dependency), so no runtime_deps are
//! needed for the toolchain itself. Go outputs that use CGO will declare
//! their own runtime_deps.
//!
//! ## Binary layout
//!
//! The installed output contains:
//!   - bin/go, bin/gofmt          (compiler and formatter)
//!   - pkg/tool/linux_amd64/*     (compiler tools: compile, link, asm, etc.)
//!   - pkg/include/               (C headers for cgo)
//!   - src/                       (Go standard library source)
//!   - lib/                       (misc: fips140, time, wasm)
//!
//! ## Dynamic dependencies
//!
//! None. All Go toolchain binaries are statically linked ELF executables.
//! This is simpler than the Rust toolchain, which needs glibc and zlib.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { goSourceRecipe } from "./go-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `
# The source tarball is pre-extracted by fetchTarball (strip-components=1),
# so /deps/go-source/ contains bin/go, pkg/, src/, etc. directly.
cp -a /deps/go-source/. $OUT

# Remove non-essential files to save space.
# Keep src/ and pkg/ — needed for go install of stdlib tools.
rm -rf $OUT/doc $OUT/test $OUT/misc $OUT/codereview.cfg
rm -f $OUT/CONTRIBUTING.md $OUT/README.md $OUT/SECURITY.md $OUT/PATENTS

# Verify the toolchain works
$OUT/bin/go version

echo "=== Go toolchain installed ==="
ls -la $OUT/bin/
echo "=== Pkg tool ==="
ls $OUT/pkg/tool/linux_amd64/ | head -5
echo "=== Go installation complete ==="
`,
  deps: [
    dep("go-source", goSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  // No runtime_deps — Go toolchain is fully static.
});

await importToStore(recipe);
export const goRecipe = recipe;
