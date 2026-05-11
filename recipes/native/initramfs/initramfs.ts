//! initramfs — bootable initramfs archive for QEMU.
//!
//! Assembles a minimal initramfs (cpio.gz) from:
//!   - base-files: directory skeleton, /etc configs, /init script
//!   - toolchain busybox: static binary providing sh, ls, cat, mount, etc.
//!
//! The output is a single file: rootfs.cpio.gz
//!
//! Boot in QEMU:
//!   qemu-system-x86_64 \
//!     -kernel /run/booted-system/kernel \
//!     -initrd <store-path>/rootfs.cpio.gz \
//!     -append "console=ttyS0" \
//!     -nographic -m 256M
//!
//! Dependencies: toolchain (busybox + build tools), base-files (skeleton)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { baseFilesRecipe } from "../base-files/base-files.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `

# --- Assemble rootfs ---

mkdir -p /tmp/rootfs

# Copy base-files skeleton (init, etc configs, directory tree)
cp -a /deps/base-files/* /tmp/rootfs/

# Install static busybox
mkdir -p /tmp/rootfs/bin
cp /deps/toolchain/bin/busybox /tmp/rootfs/bin/busybox
chmod 755 /tmp/rootfs/bin/busybox

# Create applet symlinks (sh, ls, cat, mount, grep, vi, etc.)
cd /tmp/rootfs/bin
for applet in $(/tmp/rootfs/bin/busybox --list); do
  ln -sf busybox "$applet" 2>/dev/null || true
done
cd /tmp

# Ensure /sbin exists and has key symlinks
mkdir -p /tmp/rootfs/sbin
for applet in init halt poweroff reboot; do
  ln -sf ../bin/busybox /tmp/rootfs/sbin/$applet 2>/dev/null || true
done

# --- Create cpio.gz ---

cd /tmp/rootfs
find . | cpio -o -H newc 2>/dev/null | gzip > $OUT/rootfs.cpio.gz
`,
  deps: [
    dep("base-files", baseFilesRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
});

await importToStore(recipe);
export const initramfsRecipe = recipe;
