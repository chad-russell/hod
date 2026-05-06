//! binutils native build recipe.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { hodSeedRootRecipe } from "../bootstrap/hod-seed-root.js";
import { shimsBundleRecipe } from "../shims/shims-bundle.js";
import { binutilsSourceRecipe } from "./binutils-source.js";

const preamble = hermeticPreamble({ shell: "seed", muslLinker: "seed" });

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

# Create fake makeinfo and file commands
mkdir -p /tmp/fake-bin
echo '#!/bin/sh' > /tmp/fake-bin/makeinfo && echo 'exit 0' >> /tmp/fake-bin/makeinfo && chmod +x /tmp/fake-bin/makeinfo
cat > /tmp/fake-bin/file << 'FEOF'
#!/bin/sh
echo "$1: ELF 64-bit LSB executable, x86-64"
exit 0
FEOF
chmod +x /tmp/fake-bin/file
export PATH=/tmp/fake-bin:$PATH

# Extract source
tar xf /deps/source/source -C /tmp
cd /tmp/binutils-2.42

# Build in a separate directory
mkdir -p /tmp/binutils-build && cd /tmp/binutils-build

# Force static linking by wrapping gcc with -static
# binutils' build system sometimes ignores LDFLAGS for final linking
cat > /tmp/gcc-static << 'EOF'
#!/bin/sh
exec /deps/seed/bin/gcc -static "$@"
EOF
cat > /tmp/g++-static << 'EOF'
#!/bin/sh
exec /deps/seed/bin/g++ -static "$@"
EOF
chmod +x /tmp/gcc-static /tmp/g++-static

CC=/tmp/gcc-static \\
CXX=/tmp/g++-static \\
AR=/deps/seed/bin/ar \\
RANLIB=/deps/seed/bin/ranlib \\
NM=/deps/seed/bin/nm \\
STRIP=/deps/seed/bin/strip \\
MAKEINFO=/tmp/fake-bin/makeinfo \\
CFLAGS="-O2" \\
CXXFLAGS="-O2" \\
/tmp/binutils-2.42/configure \\
  --prefix=/ \\
  --disable-werror \\
  --disable-nls \\
  --disable-gdb \\
  --disable-gdbserver \\
  --disable-sim \\
  --disable-gold \\
  --disable-gprofng \\
  --disable-lto \\
  --disable-shared \\
  --enable-deterministic-archives

make -j$(nproc)
make install DESTDIR=$OUT

# Verify and strip
for bin in $OUT/bin/*; do
  if [ -f "$bin" ] && [ -x "$bin" ]; then
    if /deps/seed/bin/readelf -l "$bin" 2>/dev/null | grep -q INTERP; then
      echo "WARNING: $bin is dynamically linked!"
    else
      echo "OK: $bin is static"
    fi
    /deps/seed/bin/strip "$bin" 2>/dev/null || true
  fi
done

# Clean up
rm -rf $OUT/share $OUT/include $OUT/etc $OUT/sbin 2>/dev/null || true`,
  ],
  dependencies: [
    dep("seed", hodSeedRootRecipe),
    dep("shims", shimsBundleRecipe),
    dep("source", binutilsSourceRecipe),
  ],
});

await importToStore(recipe);
export const binutilsRecipe = recipe;
