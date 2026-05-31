//! Distrobox — shell wrappers for tightly integrated Podman/Docker containers.
//!
//! Distrobox itself is POSIX shell. This recipe installs the upstream scripts,
//! completions, icons, and man pages. It intentionally does not package a
//! container manager; Podman/Docker/Lilipod remain host-owned integration points.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { cProfile } from "../../helpers/c.js";
import { distroboxSourceRecipe } from "./distrobox-source.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `
cp -a /deps/source/. /tmp/build
cd /tmp/build

./install --prefix "$OUT" --no-color

# NixOS commonly exposes /etc/hostname as a symlink into /etc/static. In a
# Distrobox container, upstream's post-setup sync loop follows that symlink via
# /run/host and can fail with a missing /run/host/etc/static/hostname, causing
# the container entrypoint to exit after setup completes. Hostname live-sync is
# not required for Hod's ThinkPad use case, and create-time --hostname still
# provides a valid container hostname.
grep -v '^[[:space:]]*/etc/hostname$' "$OUT/bin/distrobox-init" > /tmp/distrobox-init
mv /tmp/distrobox-init "$OUT/bin/distrobox-init"
chmod 0755 "$OUT/bin/distrobox-init"

# Keep scripts and shell integration; man pages are useful for user tools.
find $OUT/bin -type f -name 'distrobox*' -exec chmod 0755 {} +
`,
  deps: [
    dep("source", distroboxSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
});

await importToStore(recipe);
export const distroboxRecipe = recipe;
