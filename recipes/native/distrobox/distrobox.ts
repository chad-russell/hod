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
