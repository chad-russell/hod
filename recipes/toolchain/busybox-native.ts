//! busybox native build recipe — statically linked against musl.
//!
//! Built with the seed's musl-gcc so we get clean static linking
//! (glibc ≥ 2.38 has __isoc23_* symbol issues when static).
//! The result is a self-contained binary with no dynamic dependencies.
//!
//! Important bootstrap detail: this recipe deliberately depends on the
//! standalone shim `make` instead of `native-toolchain`. That avoids a
//! circular dependency where `native-toolchain` wants to bundle the busybox
//! built here.
//!
//! Key detail: the musl gcc has hardcoded internal paths from the host
//! staging directory. In the sandbox those don't exist, so we create
//! wrapper scripts that use -B to point gcc at the right subprogram
//! and library directories.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { hodSeedRootRecipe } from "../bootstrap/hod-seed-root.js";
import { linuxHeadersRecipe } from "../cross/linux-headers.js";
import { makeRecipe as shimMakeRecipe } from "../shims/make.js";
import { busyboxSourceRecipe } from "./busybox-source.js";

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

# The musl gcc has hardcoded paths from the host staging directory.
# In the sandbox those don't exist. We create a wrapper that uses
# -B to tell gcc where to find cc1, collect2, crt*.o, libgcc.a, etc.
mkdir -p /tmp/gcc-wrapper
cat > /tmp/gcc-wrapper/gcc << 'WRAPPER'
#!/bin/sh
exec /deps/seed/bin/gcc \
  -B/deps/seed/libexec/gcc/x86_64-linux-musl/11.2.1/ \
  -B/deps/seed/lib/gcc/x86_64-linux-musl/11.2.1/ \
  -B/deps/seed/x86_64-linux-musl/lib/ \
  -I/deps/seed/include \
  -L/deps/seed/lib \
  "$@"
WRAPPER
chmod +x /tmp/gcc-wrapper/gcc

tar xf /deps/source/source -C /tmp
cd /tmp/busybox-1.37.0

# Minimal static config
$MAKE defconfig

set_config_y() {
  key="CONFIG_$1"
  if grep -q "^$key=" .config; then
    sed -i "s/^$key=.*/$key=y/" .config
  elif grep -q "^# $key is not set" .config; then
    sed -i "s/^# $key is not set/$key=y/" .config
  else
    echo "$key=y" >> .config
  fi
}

set_config_n() {
  key="CONFIG_$1"
  if grep -q "^$key=" .config; then
    sed -i "s/^$key=.*/# $key is not set/" .config
  elif ! grep -q "^# $key is not set" .config; then
    echo "# $key is not set" >> .config
  fi
}

# Enable static linking and disable unavailable/unneeded features.
set_config_y STATIC
set_config_n SELINUX

# Keep the native toolchain busybox focused on build/executor applets. Some
# defconfig networking/coreutils applets pull kernel headers in ways that
# conflict with musl's libc headers in this bootstrap environment.
set_config_n WGET
set_config_n SSL_CLIENT
set_config_n TLS
set_config_n FEATURE_WGET_HTTPS
set_config_n SPLIT
set_config_n BC
set_config_n DC

# Disable applets that require Linux kernel headers not needed by builds.
set_config_n KBD_MODE
set_config_n LOADKMAP
set_config_n OPENVT
set_config_n DEALLOCVT
set_config_n SETKEYCODES
set_config_n SHOWKEY
set_config_n SETCONSOLE
set_config_n FGCONSOLE
set_config_n CONSOLEFONT
set_config_n SETLOGCONS
set_config_n INIT
set_config_n HALT
set_config_n POWEROFF
set_config_n REBOOT
set_config_n FEATURE_UTMP
set_config_n FEATURE_WTMP

yes n | $MAKE oldconfig

# Build with the gcc wrapper — statically linked via musl, no glibc issues.
# HOSTCC builds helper tools (fixdep, kconfig), CC builds busybox itself.
$MAKE -j$(nproc) \
  HOSTCC=/tmp/gcc-wrapper/gcc \
  CC=/tmp/gcc-wrapper/gcc \
  CFLAGS="-O2 -static -DNAME_MAX=255 -DLONG_BIT=64 -DSSIZE_MAX=9223372036854775807L -I/deps/linux-headers/include"

# Install just the busybox binary
mkdir -p $OUT/bin
cp busybox $OUT/bin/busybox
chmod +x $OUT/bin/busybox`,
  ],
  env: [],
  dependencies: [
    dep("linux-headers", linuxHeadersRecipe),
    dep("make", shimMakeRecipe),
    dep("seed", hodSeedRootRecipe),
    dep("source", busyboxSourceRecipe),
  ],
});

await importToStore(recipe);
export const busyboxNativeRecipe = recipe;
