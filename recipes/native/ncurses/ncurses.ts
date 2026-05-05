//! ncurses native build recipe.
import { process, dep, importToStore, hermeticPreamble } from "../../../js/src/index.js";
import { seedRootRecipe } from "../../bootstrap/seed-root.js";
import { makeRecipe } from "../../shims/make.js";
import { ncursesSourceRecipe } from "./ncurses-source.js";

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
cd /tmp/ncurses-6.6

CC=/deps/seed/bin/gcc \\
AR=/deps/seed/bin/ar \\
RANLIB=/deps/seed/bin/ranlib \\
CFLAGS="-O2" \\
LDFLAGS="-static" \\
sh ./configure \\
  --prefix=/ \\
  --disable-shared \\
  --enable-static \\
  --enable-widec \\
  --without-debug \\
  --without-ada \\
  --without-manpages \\
  --without-tests \\
  --without-cxx-binding \\
  --disable-stripping

make -j$(nproc)
make install DESTDIR=$OUT

# Create non-widec compatibility symlinks so cbonsai's Makefile can find -lncurses
cd $OUT/lib
for f in libncursesw*; do
  ln -sf "$f" "$(echo "$f" | sed 's/w//')"
done
cd $OUT/lib/pkgconfig
for f in *.pc; do
  ln -sf "$f" "$(echo "$f" | sed 's/w//')"
done`,
  ],
  env: { PATH: "/deps/seed/bin" },
  dependencies: [
    dep("make", makeRecipe),
    dep("seed", seedRootRecipe),
    dep("source", ncursesSourceRecipe),
  ],
});

await importToStore(recipe);
export const ncursesRecipe = recipe;
