//! Bootstrap busybox built from source using the musl.cc seed toolchain.
//!
//! This replaces the opaque busybox binary (unknown origin, unknown config)
//! with a reproducible busybox 1.37.0 built from source. The source-built
//! busybox is used by `hod-seed-root.ts`, breaking the dependency on the
//! opaque binary for all downstream recipes.
//!
//! Architecture: depends on `seedRootRecipe` (musl.cc + opaque busybox as
//! executor) to avoid circular dependency. The opaque busybox is only used
//! as the build shell; the OUTPUT is a fully source-built binary.
//!
//! After this change, the opaque busybox is only in the transitive dependency
//! chain of `seed-root.ts` → bootstrap ladder recipes. Everything downstream
//! of `hod-seed-root` uses this source-built version.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "./seed-root.js";
import { makeRecipe as shimMakeRecipe } from "../shims/make.js";
import { busyboxSourceRecipe } from "../toolchain/busybox-source.js";

const preamble = hermeticPreamble({
  shell: "seed",
  muslLinker: "seed",
});

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

export PATH=/tmp/gcc-wrapper:/deps/make/bin:/deps/seed/bin
MAKE=/deps/make/bin/make

# Sanity check: the bootstrap make must be present and runnable.
$MAKE --version | head -1

# The musl.cc gcc has hardcoded paths from the host staging directory.
# In the sandbox those don't exist. We create a wrapper that uses
# -B to tell gcc where to find cc1, collect2, crt*.o, libgcc.a, etc.
mkdir -p /tmp/gcc-wrapper
cat > /tmp/gcc-wrapper/gcc << 'WRAPPER'
#!/bin/sh
exec /deps/seed/bin/gcc \\
  -B/deps/seed/libexec/gcc/x86_64-linux-musl/11.2.1/ \\
  -B/deps/seed/lib/gcc/x86_64-linux-musl/11.2.1/ \\
  -B/deps/seed/x86_64-linux-musl/lib/ \\
  -I/deps/seed/include \\
  -L/deps/seed/lib \\
  "$@"
WRAPPER
chmod +x /tmp/gcc-wrapper/gcc

tar xf /deps/source/source -C /tmp
cd /tmp/busybox-1.37.0

# Start with defconfig (full feature set, matching opaque busybox)
$MAKE defconfig

# Enable static linking (self-contained binary, no dynamic deps)
echo "CONFIG_STATIC=y" >> .config

# Disable SELinux (not available in sandbox)
echo "CONFIG_SELINUX=n" >> .config

# Disable applets that require Linux kernel headers not available
# in the musl sysroot. These are NOT used by the bootstrap pipeline
# (which mainly needs: sh, cp, mv, rm, mkdir, ln, cat, echo, tar,
# sed, awk, grep, find, chmod, install, etc.)
echo "CONFIG_KBD_MODE=n" >> .config
echo "CONFIG_LOADKMAP=n" >> .config
echo "CONFIG_OPENVT=n" >> .config
echo "CONFIG_DEALLOCVT=n" >> .config
echo "CONFIG_SETKEYCODES=n" >> .config
echo "CONFIG_SHOWKEY=n" >> .config
echo "CONFIG_SETCONSOLE=n" >> .config
echo "CONFIG_FGCONSOLE=n" >> .config
echo "CONFIG_CONSOLEFONT=n" >> .config
echo "CONFIG_SETLOGCONS=n" >> .config

# Also disable init/halt/reboot which need Linux-specific headers
# and aren't needed for builds
echo "CONFIG_INIT=n" >> .config
echo "CONFIG_HALT=n" >> .config
echo "CONFIG_POWEROFF=n" >> .config
echo "CONFIG_REBOOT=n" >> .config

# Disable features requiring kernel headers
echo "CONFIG_FEATURE_UTMP=n" >> .config
echo "CONFIG_FEATURE_WTMP=n" >> .config

# Reconcile config (disable any options that depended on the above)
yes n | $MAKE oldconfig

# Build with the gcc wrapper — statically linked via musl
$MAKE -j$(nproc) \
  HOSTCC=/tmp/gcc-wrapper/gcc \
  CC=/tmp/gcc-wrapper/gcc \
  CFLAGS="-O2 -static"

# Verify the binary is static
/tmp/gcc-wrapper/gcc -print-file-name= | head -1 || true
file busybox 2>/dev/null || readelf -h busybox 2>/dev/null | head -3

# Install busybox at $OUT/busybox to match the opaque File recipe layout.
# When mounted as a dep, this gives /deps/<name>/busybox — same path as
# the opaque fileFromHash recipe (which the build system wraps as
# /deps/<name>/<name> for File artifacts).
mkdir -p $OUT/bin
cp busybox $OUT/bin/busybox
chmod +x $OUT/bin/busybox

# Also place at $OUT/busybox for backward compatibility with recipes
# that reference the File recipe layout (/deps/busybox/busybox).
cp busybox $OUT/busybox
chmod +x $OUT/busybox

# Verify it works
$OUT/busybox --list | head -5
echo "busybox applet count: $($OUT/busybox --list | wc -l)"
$OUT/busybox sh -c 'echo "hello from source-built busybox"'`,
  ],
  dependencies: [
    dep("make", shimMakeRecipe),
    dep("seed", seedRootRecipe),
    dep("source", busyboxSourceRecipe),
  ],
});

await importToStore(recipe);
export const busyboxFromSourceRecipe = recipe;
