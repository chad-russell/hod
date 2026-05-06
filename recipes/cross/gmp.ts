//! gmp cross-compilation recipe.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "../bootstrap/seed-root.js";
import { shimsBundleRecipe } from "../shims/shims-bundle.js";
import { gmpSourceRecipe } from "./gmp-source.js";

const preamble = hermeticPreamble({ shell: "seed", muslLinker: "seed" });

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

tar xf /deps/source/source -C /tmp
cd /tmp/gmp-6.3.0

# Build GMP as a static-only library using the musl toolchain.
# Static linking avoids the musl/glibc dynamic linker mismatch during
# configure's test compilations. GCC will link the static archive directly.
CC=/deps/seed/bin/gcc \\
AR=/deps/seed/bin/ar \\
RANLIB=/deps/seed/bin/ranlib \\
CFLAGS="-O2" \\
./configure \\
  --host=x86_64-linux-gnu \\
  --prefix=/ \\
  --disable-shared \\
  --enable-static \\
  --disable-cxx

make -j$(nproc)
make install DESTDIR=$OUT

# Remove libtool archives — they embed the DESTDIR install path and break
# downstream libtool consumers.  Static .a archives are all we need.
find $OUT -name '*.la' -delete`,
  ],
  dependencies: [
    dep("seed", seedRootRecipe),
    dep("shims", shimsBundleRecipe),
    dep("source", gmpSourceRecipe),
  ],
});

await importToStore(recipe);
export const gmpRecipe = recipe;
