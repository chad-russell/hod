//! hwdata build recipe — hardware identification databases.
//!
//! Installs hwdata v0.407, providing hardware ID databases (pnp.ids, pci.ids, usb.ids).
//! This is a data-only package — no compilation, just file installation.
//!
//! Required by libdisplay-info for PNP ID lookup during EDID parsing.

import { shellBuild, dep, importToStore, hermeticPreamble } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { hwdataSourceRecipe } from "./hwdata-source.js";

const recipe = await shellBuild({
  shell: "/deps/toolchain/bin/busybox",
  preamble: hermeticPreamble({ shell: "toolchain", glibcLinker: "toolchain" }),
  env: {
    PATH: "/deps/toolchain/bin",
  },
  script: `

cp -a /deps/source/. /tmp/build
cd /tmp/build

# Run configure to generate Makefile.inc and hwdata.pc
./configure

# Install to output with prefix=/
make install DESTDIR=$OUT datadir=/share libdir=/lib blacklist=false

# Fix hwdata.pc to use pcfiledir-based path
for pc in $OUT/share/pkgconfig/*.pc; do
  [ -f "$pc" ] || continue
  sed -i 's|^prefix=.*|prefix=\${pcfiledir}/../..|' "$pc"
  sed -i 's|^datadir=.*|datadir=\${prefix}/share|' "$pc"
  sed -i 's|^pkgdatadir=.*|pkgdatadir=\${datadir}/hwdata|' "$pc"
done
`,
  deps: [
    dep("source", hwdataSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: [],
});

await importToStore(recipe);
export const hwdataRecipe = recipe;
