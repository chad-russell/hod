//! sassc build recipe — Sass CSS compiler.
//!
//! Builds sassc 3.6.2 against libsass 3.6.5 (static).
//! sassc is a build-time tool needed by libadwaita to compile SCSS stylesheets.
//! Produces a standalone binary that only needs glibc at runtime.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libsassSourceRecipe, sasscSourceRecipe } from "./sassc-source.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_BINARIES } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...cProfile({ cxx: true }),
  script: `

# Build libsass as a static library first
cp -a /deps/libsass/. /tmp/libsass
cd /tmp/libsass

export BUILD="static"

make -j$(nproc) -C /tmp/libsass

# Now build sassc against the built libsass
cp -a /deps/sassc/. /tmp/sassc
cd /tmp/sassc

export SASS_LIBSASS_PATH=/tmp/libsass
export LDFLAGS="$HOD_DUMMY_RPATH -L/tmp/libsass/lib"
export LD_LIBRARY_PATH="/tmp/libsass/lib"

make -j$(nproc) -C /tmp/sassc sassc

# Install just the sassc binary
mkdir -p $OUT/bin
/deps/toolchain/bin/install -m 755 /tmp/sassc/bin/sassc $OUT/bin/sassc

${STRIP_BINARIES}
`,
  deps: [
    dep("libsass", libsassSourceRecipe),
    dep("sassc", sasscSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const sasscRecipe = recipe;
