//! brightnessctl native build recipe — read and control device brightness.
//!
//! Builds Hummer12007/brightnessctl 0.5.1 from source.
//! Single C file, no external dependencies beyond glibc and libm.
//!
//! Build system is a simple Makefile (no configure script in the tarball).
//! We override VERSION on the make command line to match the release tag;
//! the Makefile's own CFLAGS already handle -DVERSION="${VERSION}".
//!
//! systemd support is intentionally disabled (ENABLE_SYSTEMD not set) to
//! avoid the libsystemd dependency — the tool works fine without it using
//! either udev rules or suid.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { brightnessctlSourceRecipe } from "./brightnessctl-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `
# Build — CC, CFLAGS, LDFLAGS etc. come from cProfile() via process env.
# Override VERSION so the Makefile's -DVERSION macro picks up the correct value.
make -j$(nproc) VERSION=0.5.1

# Install (no udev rules, no systemd)
make install DESTDIR=$OUT PREFIX=/ INSTALL_UDEV_RULES=0

${STRIP_BINARIES}
rm -rf $OUT/share/man $OUT/share/doc 2>/dev/null || true
`,
  deps: [
    dep("source", brightnessctlSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const brightnessctlRecipe = recipe;
