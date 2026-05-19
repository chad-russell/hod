//! cosmic-icons — Icon theme for COSMIC desktop (data-only).
//!
//! Provides the COSMIC icon theme SVG files and icon theme index.
//! No compilation needed — just install the data files.

import { fetchGit, importToStore, shellBuild, dep, hermeticPreamble } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";

const source = await fetchGit({
  url: "https://github.com/pop-os/cosmic-icons.git",
  revision: "2c697e8e97cfd619107a872b28c31317281184ff",
  hash: "c8c781a291253c3f17d3a601e0a7b97af7fb63c93099792db073e5f516573b3a",
});

const recipe = await shellBuild({
  shell: `/deps/toolchain/bin/busybox`,
  preamble: hermeticPreamble({ shell: "toolchain", glibcLinker: "toolchain" }),
  deps: [
    dep("source", source),
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
  script: `
    mkdir -p $OUT/share/icons/Cosmic
    cp -a /deps/source/. $OUT/share/icons/Cosmic/
  `,
});

await importToStore(recipe);
export const cosmicIconsRecipe = recipe;
