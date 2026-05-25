//! Node.js native build recipe — the JavaScript runtime.
//!
//! Builds Node.js 22.22.3 LTS with shared OpenSSL, zlib, and nghttp2 from
//! the store. V8, libuv, c-ares, brotli, ICU, and other libraries are
//! bundled in the Node.js source tree and compiled statically into the
//! node binary.
//!
//! The configure script is Python-based and invoked via `python3 ./configure`.
//! Uses make for the build and install steps (configure's --ninja mode
//! generates build files in out/Release/ which complicates direct invocation).
//!
//! Dependencies:
//!   - python (configure script)
//!   - openssl (TLS/SSL) — shared
//!   - zlib (compression) — shared
//!   - nghttp2 (HTTP/2) — shared
//!   - bzip2, ncurses, readline, xz, libffi, expat — Python runtime deps
//!     needed so Python's stdlib modules (bz2, curses, readline, lzma, etc.)
//!     can load their shared libraries inside the sandbox.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { nodejsSourceRecipe } from "./nodejs-source.js";
import { pythonRecipe } from "../python/python.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { nghttp2Recipe } from "../nghttp2/nghttp2.js";
import { bzip2Recipe } from "../bzip2/bzip2.js";
import { ncursesRecipe } from "../ncurses/ncurses.js";
import { readlineRecipe } from "../readline/readline.js";
import { xzRecipe } from "../xz/xz.js";
import { libffiRecipe } from "../libffi/libffi.js";
import { expatRecipe } from "../expat/expat.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile({
    python: "python",
    includeDeps: ["openssl", "zlib", "nghttp2"],
    libDeps: ["openssl", "zlib", "nghttp2"],
    pkgConfigDeps: ["openssl", "zlib", "nghttp2"],
  }),
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export LD_LIBRARY_PATH="/deps/openssl/lib:/deps/zlib/lib:/deps/nghttp2/lib:/deps/bzip2/lib:/deps/ncurses/lib:/deps/readline/lib:/deps/xz/lib:/deps/libffi/lib:/deps/expat/lib"

python3 ./configure \\
  --prefix=/ \\
  --shared-openssl \\
  --shared-openssl-includes=/deps/openssl/include \\
  --shared-openssl-libpath=/deps/openssl/lib \\
  --shared-zlib \\
  --shared-zlib-includes=/deps/zlib/include \\
  --shared-zlib-libpath=/deps/zlib/lib \\
  --shared-nghttp2 \\
  --shared-nghttp2-includes=/deps/nghttp2/include \\
  --shared-nghttp2-libpath=/deps/nghttp2/lib \\
  --without-corepack \\
  --without-npm

make -j$(nproc)
make install DESTDIR=$OUT PREFIX=/

/deps/toolchain/bin/strip $OUT/bin/node 2>/dev/null || true
cd $OUT/bin && ln -sf node nodejs 2>/dev/null || true

rm -rf $OUT/share/doc $OUT/share/man 2>/dev/null || true
`,
  deps: [
    dep("source", nodejsSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("python", pythonRecipe),
    dep("openssl", opensslRecipe),
    dep("zlib", zlibRecipe),
    dep("nghttp2", nghttp2Recipe),
    dep("bzip2", bzip2Recipe),
    dep("ncurses", ncursesRecipe),
    dep("readline", readlineRecipe),
    dep("xz", xzRecipe),
    dep("libffi", libffiRecipe),
    dep("expat", expatRecipe),
  ],
  runtime_deps: ["nghttp2", "openssl", "toolchain", "zlib"],
});

await importToStore(recipe);
export const nodejsRecipe = recipe;
