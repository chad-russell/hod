//! base-files — minimal rootfs skeleton for a bootable Linux system.
//!
//! This is a generator recipe (no upstream source). It creates the directory
//! tree and configuration files needed to boot an initramfs in QEMU:
//!
//!   - Directory structure: /etc, /var, /tmp, /run, /root, /home, /dev, /proc, /sys
//!   - /etc/passwd, /etc/group, /etc/shadow — root user (uid 0, no password)
//!   - /etc/fstab — mount table for proc, sysfs, devtmpfs, tmpfs
//!   - /etc/hostname, /etc/hosts
//!   - /etc/profile — basic shell profile
//!   - /init — PID 1 script: mounts filesystems, starts shell
//!
//! This output is merged with busybox, bash, coreutils, etc. by the
//! initramfs recipe to produce a bootable cpio archive.
//!
//! Dependencies: toolchain only (uses busybox for mkdir, cat, etc.)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";

const recipe = await shellBuild({
  toolchain: "toolchain",
  script: `

# --- Directory structure ---

mkdir -p $OUT/etc
mkdir -p $OUT/var/log
mkdir -p $OUT/var/run
mkdir -p $OUT/var/tmp
mkdir -p $OUT/tmp
mkdir -p $OUT/run
mkdir -p $OUT/root
mkdir -p $OUT/home
mkdir -p $OUT/dev
mkdir -p $OUT/proc
mkdir -p $OUT/sys

# --- /etc/passwd ---
cat > $OUT/etc/passwd << 'EOF'
root:x:0:0:root:/root:/bin/sh
nobody:x:65534:65534:nobody:/nonexistent:/bin/false
EOF

# --- /etc/group ---
cat > $OUT/etc/group << 'EOF'
root:x:0:
nobody:x:65534:
EOF

# --- /etc/shadow (root has no password, empty field = no password) ---
cat > $OUT/etc/shadow << 'EOF'
root::0:0:99999:7:::
nobody:*:0:0:99999:7:::
EOF
chmod 640 $OUT/etc/shadow

# --- /etc/fstab ---
cat > $OUT/etc/fstab << 'EOF'
proc     /proc  proc    defaults           0 0
sysfs    /sys   sysfs   defaults           0 0
devtmpfs /dev   devtmpfs defaults           0 0
tmpfs    /tmp   tmpfs   defaults,nosuid    0 0
tmpfs    /run   tmpfs   defaults,nosuid    0 0
EOF

# --- /etc/hostname ---
echo "hod" > $OUT/etc/hostname

# --- /etc/hosts ---
cat > $OUT/etc/hosts << 'EOF'
127.0.0.1 localhost hod
::1       localhost hod
EOF

# --- /etc/profile ---
cat > $OUT/etc/profile << 'PROFILE'
export PATH=/bin:/sbin:/usr/bin:/usr/sbin
export HOME=/root
export TERM=linux

if [ -z "\$PS1" ]; then
  export PS1='\\u@\\h:\\w\\$ '
fi
PROFILE

# --- /init (PID 1) ---
# This runs as the first process in the initramfs.
# Uses /bin/sh (busybox ash in the final initramfs).
cat > $OUT/init << 'INIT'
#!/bin/sh

# Mount essential filesystems
mount -t proc     proc  /proc
mount -t sysfs    sysfs /sys
mount -t devtmpfs dev   /dev

# Mount tmpfs for /run and /tmp
mkdir -p /dev/pts /dev/shm
mount -t devpts   devpts /dev/pts
mount -t tmpfs    shm    /dev/shm
mount -t tmpfs    tmpfs  /tmp
mount -t tmpfs    tmpfs  /run

# Set hostname
hostname hod

# Print boot banner
echo
echo "========================================"
echo "  Hod Linux"
echo "  Built entirely by the Hod build system"
echo "========================================"
echo

# Start shell (exec replaces PID 1 with the shell)
export PATH=/bin:/sbin:/usr/bin:/usr/sbin
export HOME=/root
export TERM=linux
exec /bin/sh
INIT
chmod 755 $OUT/init
`,
  deps: [
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const baseFilesRecipe = recipe;
