//! bubblewrap build recipe — unprivileged sandboxing tool for Linux.
//!
//! Builds bubblewrap 0.11.2. Provides the `bwrap` binary used by flatpak (and
//! standalone) for creating sandboxes via Linux user namespaces.
//!
//! Dependencies:
//!   - libcap (POSIX.1e capabilities)
//!   - toolchain (gcc, glibc, etc.)

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { libcapRecipe } from "../libcap/libcap.js";
import { bubblewrapSourceRecipe } from "./bubblewrap-source.js";
import { mesonRecipe } from "../meson/meson.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { pythonRecipe } from "../python/python.js";
import { mesonProfile } from "../../helpers/meson.js";
import { STRIP_ALL } from "../../helpers/strip.js";

const recipe = await shellBuild({
  ...mesonProfile({
    python: "python",
    includeDeps: ["libcap"],
    libDeps: ["libcap"],
    pkgConfigDeps: ["libcap"],
  }),
  sourceDir: true,
  script: `
mkdir -p /usr/include

meson setup build \\
  --prefix=/ \\
  --buildtype=release \\
  -Dselinux=disabled \\
  -Dtests=false \\
  -Dman=disabled \\
  -Dbash_completion=disabled \\
  -Dzsh_completion=disabled

ninja -C build
DESTDIR=$OUT ninja -C build install

${STRIP_ALL}
rm -rf $OUT/share/man $OUT/share/bash-completion
`,
  deps: [
    dep("source", bubblewrapSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("libcap", libcapRecipe),
    dep("meson", mesonRecipe),
    dep("ninja", ninjaRecipe),
    dep("python", pythonRecipe),
  ],
  runtime_deps: ["libcap", "toolchain"],
});

await importToStore(recipe);
export const bubblewrapRecipe = recipe;
