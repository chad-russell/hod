//! mpc cross-compilation recipe.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "../bootstrap/seed-root.js";
import { shimsBundleRecipe } from "../shims/shims-bundle.js";
import { gmpRecipe } from "./gmp.js";
import { mpfrRecipe } from "./mpfr.js";
import { mpcSourceRecipe } from "./mpc-source.js";

const preamble = hermeticPreamble({ shell: "seed", muslLinker: "seed", shims: "shims" });

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

tar xf /deps/source/source -C /tmp
cd /tmp/mpc-1.3.1

# Configure MPC as cross-compile (--host) so configure skips runtime tests.
# Build as static-only library using musl toolchain.
CC=/deps/seed/bin/gcc \\
AR=/deps/seed/bin/ar \\
RANLIB=/deps/seed/bin/ranlib \\
CFLAGS="-O2" \\
./configure \\
  --host=x86_64-linux-gnu \\
  --prefix=/ \\
  --disable-shared \\
  --enable-static \\
  --with-gmp=/deps/gmp \\
  --with-mpfr=/deps/mpfr

make -j$(nproc)
make install DESTDIR=$OUT

# Remove libtool archives
find $OUT -name '*.la' -delete`,
  ],
  dependencies: [
    dep("gmp", gmpRecipe),
    dep("mpfr", mpfrRecipe),
    dep("seed", seedRootRecipe),
    dep("shims", shimsBundleRecipe),
    dep("source", mpcSourceRecipe),
  ],
});

await importToStore(recipe);
export const mpcRecipe = recipe;
