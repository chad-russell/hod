//! eudev build recipe — standalone udev implementation.
//!
//! Builds eudev 3.2.14, providing libudev for device enumeration.
//! Used by libinput, libwacom, and cosmic-comp for input/GPU device discovery.
//!
//! eudev uses autotools and requires autoreconf to generate configure.
//! We disable most features (selinux, hwdb, rule-generator, mtd_probe)
//! and only build the library and udevd daemon.
//!
//! Dependencies: util-linux (libblkid), kmod, toolchain.
//! Build-time: autoconf, automake, libtool.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { eudevSourceRecipe } from "./eudev-source.js";
import { utilLinuxRecipe } from "../util-linux/util-linux.js";
import { kmodRecipe } from "../kmod/kmod.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { zstdRecipe } from "../zstd/zstd.js";
import { xzRecipe } from "../xz/xz.js";
import { opensslRecipe } from "../openssl/openssl.js";
import { autoconfRecipe } from "../autoconf/autoconf.js";
import { automakeRecipe } from "../automake/automake.js";
import { libtoolRecipe } from "../libtool/libtool.js";
import { perlRecipe } from "../perl/perl.js";
import { m4Recipe } from "../m4/m4.js";
import { pkgconfRecipe } from "../pkgconf/pkgconf.js";
import { gperfRecipe } from "../gperf/gperf.js";
import { cProfile } from "../../helpers/c.js";
import { STRIP_ALL, RELOCATE_PKG_CONFIG } from "../../helpers/strip.js";

export const eudevRuntimeDeps = ["kmod", "toolchain", "util-linux"];

const recipe = await shellBuild({
  ...cProfile({
    cxx: true,
    pkgConfigDeps: ["util-linux", "kmod", "zlib", "zstd", "xz", "openssl"],
    includeDeps: ["util-linux", "kmod"],
    binDeps: ["autoconf", "automake", "libtool", "m4", "pkgconf", "gperf"],
  }),
  sourceDir: true,
  script: `
# Perl needs its library path set (perl built with prefix=/)
export PERL5LIB="/deps/perl/lib/perl5/site_perl/5.40.0/x86_64-linux:/deps/perl/lib/perl5/site_perl/5.40.0:/deps/perl/lib/perl5/5.40.0/x86_64-linux:/deps/perl/lib/perl5/5.40.0"
export LIBTOOLIZE=/deps/libtool/bin/libtoolize
# libtoolize uses #!/usr/bin/env sh, so we need /usr/bin/env
mkdir -p /usr/bin
ln -sf /deps/toolchain/bin/busybox /usr/bin/env

# Fix libtoolize's hardcoded //share paths from prefix=/.
# Can't modify /deps (read-only), so copy and patch.
cp /deps/libtool/bin/libtoolize /tmp/libtoolize
sed -i 's|//share/libtool|/deps/libtool/share/libtool|g' /tmp/libtoolize
sed -i 's|//share/aclocal|/deps/libtool/share/aclocal|g' /tmp/libtoolize
sed -i 's|//share|/deps/libtool/share|g' /tmp/libtoolize
sed -i 's|  prefix="/"|  prefix="/deps/libtool"|g' /tmp/libtoolize
chmod +x /tmp/libtoolize
export LIBTOOLIZE=/tmp/libtoolize


# Generate configure script
mkdir -p m4
# Include libtool's aclocal macros
export ACLOCAL_PATH="/deps/libtool/share/aclocal:/deps/automake/share/aclocal-1.18:/deps/pkgconf/share/aclocal"
autoreconf -f -i -v 2>&1

# Configure: enable blkid + kmod, disable everything else
./configure \\
  --prefix=/ \\
  --enable-blkid \\
  --enable-kmod \\
  --disable-selinux \\
  --disable-manpages \\
  --disable-hwdb \\
  --disable-rule-generator \\
  --disable-mtd-probe

make -j$(nproc)
make install DESTDIR=$OUT

${RELOCATE_PKG_CONFIG}
for pc in $OUT/lib/pkgconfig/*.pc $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  sed -i 's|^exec_prefix=.*|exec_prefix=\\\${prefix}|' "$pc"
  sed -i 's|^libdir=.*|libdir=\\\${prefix}/lib|' "$pc"
  sed -i 's|^includedir=.*|includedir=\\\${prefix}/include|' "$pc"
done

${STRIP_ALL}
`,
  deps: [
    dep("source", eudevSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("util-linux", utilLinuxRecipe),
    dep("kmod", kmodRecipe),
    dep("zlib", zlibRecipe),
    dep("zstd", zstdRecipe),
    dep("xz", xzRecipe),
    dep("openssl", opensslRecipe),
    dep("autoconf", autoconfRecipe),
    dep("automake", automakeRecipe),
    dep("libtool", libtoolRecipe),
    dep("perl", perlRecipe),
    dep("m4", m4Recipe),
    dep("pkgconf", pkgconfRecipe),
    dep("gperf", gperfRecipe),
  ],
  runtime_deps: eudevRuntimeDeps,
});

await importToStore(recipe);
export const eudevRecipe = recipe;
