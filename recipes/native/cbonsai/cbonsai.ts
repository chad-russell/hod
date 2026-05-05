//! cbonsai recipe — TypeScript build using the hod SDK.
//!
//! Builds cbonsai v1.4.2, a terminal bonsai tree generator.
//! Depends on ncurses (static, widechar) and the seed toolchain.
//!
//! Run with: bun run recipes/native/cbonsai/cbonsai.ts

import {
  process,
  dep,
  download,
  writeHod,
  writeJson,
  fromJson,
  type BuiltRecipe,
} from "../../../js/src/index.js";

// Import ncurses recipe from its TypeScript definition.
// Bun evaluates ncurses.ts first (topological order), so its hash is
// available by the time we reference it here.
import { ncursesRecipe } from "../ncurses/ncurses.ts";

const dir = import.meta.dir;

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

// cbonsai source — a Download recipe
const source: BuiltRecipe = await download({
  url: "https://gitlab.com/jallbrit/cbonsai/-/archive/v1.4.2/cbonsai-v1.4.2.tar.gz",
  hash: "727a0553ab357619b9fa0f3dc71614f11ad8ff51120b83dc9567abbc0d520997",
});

// seed — the bootstrap toolchain. This is a Process recipe that depends on
// busybox (file) and musl-toolchain (unpack). We reference it from the
// existing JSON since those transitive deps are already built.
const seed: BuiltRecipe = await fromJson(
  `${dir}/../../bootstrap/seed-root.json`,
);

// Static make from shims (for building inside the sandbox)
const make: BuiltRecipe = await fromJson(`${dir}/../../shims/make.json`);

// ---------------------------------------------------------------------------
// cbonsai build recipe
// ---------------------------------------------------------------------------

const cbonsai = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

# Ensure /bin/sh exists for scripts with #!/bin/sh shebangs
# Also link cc → gcc for cbonsai's Makefile (CC = cc by default)
mkdir -p /bin
ln -sf /deps/seed/bin/busybox /bin/sh
ln -sf /deps/seed/bin/gcc /bin/cc

tar xf /deps/source/source -C /tmp
cd /tmp/cbonsai-v1.4.2

# Build cbonsai — single C file, needs ncursesw
# We skip pkg-config and pass flags directly since we have a static ncurses
CC=/deps/seed/bin/gcc \\
CFLAGS="-O2 -I/deps/ncurses/include -I/deps/ncurses/include/ncursesw" \\
LDFLAGS="-static -L/deps/ncurses/lib" \\
/deps/make/bin/make cbonsai LDLIBS="-lpanelw -lncursesw"

mkdir -p $OUT/bin
cp cbonsai $OUT/bin/cbonsai
chmod +x $OUT/bin/cbonsai`,
  ],
  env: { PATH: "/bin:/deps/seed/bin" },
  dependencies: [
    dep("make", make),
    dep("ncurses", ncursesRecipe),
    dep("seed", seed),
    dep("source", source),
  ],
});

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

await writeHod(cbonsai, `${dir}/cbonsai-from-ts.hod`);
writeJson(cbonsai, `${dir}/cbonsai-from-ts.json`);

// Output the hash for verification
console.log(`✅ cbonsai hash: ${cbonsai.hash}`);

export const cbonsaiRecipe = cbonsai;
