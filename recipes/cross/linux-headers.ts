//! linux-headers cross-compilation recipe.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { hodSeedRootRecipe } from "../bootstrap/hod-seed-root.js";
import { linuxHeadersSourceRecipe } from "./linux-headers-source.js";
import { shimsBundleRecipe } from "../shims/shims-bundle.js";

const preamble = hermeticPreamble({ shell: "seed", muslLinker: "seed" });

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

# Create a minimal rsync shim for kernel headers_install
mkdir -p /tmp/bin
cat > /tmp/bin/rsync << 'RSYNC'
#!/bin/sh
# Minimal rsync: copy .h files from source dirs to destination
# Kernel calls: rsync -mrl --include='*.h' ... <src>/ <dst>/
args=""
for arg in "$@"; do
  case "$arg" in -*) continue ;; esac
  args="$args $arg"
done
# Last arg is destination, second-to-last is source
eval set -- $args
while [ $# -gt 2 ]; do shift; done
SRC="$1"
DST="$2"
mkdir -p "$DST"
cd "$SRC"
find . -type f -name '*.h' | while IFS= read -r f; do
  mkdir -p "$DST/$(dirname "$f")"
  cp "$f" "$DST/$f"
done
RSYNC
chmod +x /tmp/bin/rsync

export PATH=/tmp/bin:/deps/seed/bin:/deps/shims/bin

tar xf /deps/source/source -C /tmp
cd /tmp/linux-6.6.85

make headers_install \\
  ARCH=x86 \\
  INSTALL_HDR_PATH=$OUT \\
  HOSTCC=/deps/seed/bin/gcc \\
  HOSTCFLAGS="-O2 -static"

# The kernel installs directly to $OUT/ (e.g., $OUT/linux/, $OUT/asm/).
# Wrap in include/ so downstream deps find headers at the standard location.
mkdir -p /tmp/hdr_tmp
cp -a $OUT/* /tmp/hdr_tmp/
rm -rf $OUT/*
mkdir -p $OUT/include
cp -a /tmp/hdr_tmp/* $OUT/include/
rm -rf /tmp/hdr_tmp

# Clean up generated non-header artifacts
find $OUT -name '..cmd' -delete
find $OUT -name '.install' -delete
find $OUT -name '*.c' -delete`,
  ],
  dependencies: [
    dep("seed", hodSeedRootRecipe),
    dep("shims", shimsBundleRecipe),
    dep("source", linuxHeadersSourceRecipe),
  ],
});

await importToStore(recipe);
export const linuxHeadersRecipe = recipe;
