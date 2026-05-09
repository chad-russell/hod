//! sqlite native build recipe — self-contained SQL database engine.
//!
//! Builds SQLite 3.53.1 (autoconf amalgamation). Standalone, zero deps
//! beyond the toolchain. Produces libsqlite3.so, sqlite3 CLI, headers,
//! and pkg-config.
//!
//! Dynamically links glibc (relocated via runtime_deps).
//!
//! Note: SQLite uses autosetup which builds a bootstrap jimsh. The bootstrap
//! build tries `cc` and `gcc` directly without respecting CC env. We create
//! a `cc` wrapper that includes the necessary sysroot flags.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { sqliteSourceRecipe } from "./sqlite-source.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

# Extract source
tar xf /deps/source/source -C /tmp
cd /tmp/sqlite-autoconf-3530100

# Autosetup builds a bootstrap jimsh using plain 'cc'/'gcc', ignoring CC.
# Create a wrapper that includes sysroot flags so the bootstrap can compile.
mkdir -p /tmp/cc-wrapper
cat > /tmp/cc-wrapper/cc << 'EOF'
#!/bin/sh
exec /deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin "$@"
EOF
chmod +x /tmp/cc-wrapper/cc
export PATH="/tmp/cc-wrapper:$PATH"

./configure \\
  --prefix=/ \\
  --enable-shared \\
  --disable-static \\
  --disable-dependency-tracking \\
  CC="$CC"

make -j$(nproc)
make install DESTDIR=$OUT

# Strip binaries
find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true

# Clean up — remove docs, man, la files. Keep lib/pkgconfig for downstream.
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info $OUT/lib/*.la 2>/dev/null || true

# Verify key outputs
ls -la $OUT/bin/sqlite3
ls -la $OUT/lib/libsqlite3.so
ls -la $OUT/include/sqlite3.h $OUT/include/sqlite3ext.h
ls -la $OUT/lib/pkgconfig/sqlite3.pc
`,
  deps: [
    dep("source", sqliteSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const sqliteRecipe = recipe;
