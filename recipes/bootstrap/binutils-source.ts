//! binutils source download.
//!
//! Downloads GNU binutils 2.44 from sourceware.org. This is the source tarball
//! used to build musl-targeting binutils in binutils-musl.ts.
import { download, importToStore } from "../../js/src/index.js";

const recipe = await download({
  url: "https://sourceware.org/pub/binutils/releases/binutils-2.44.tar.xz",
  hash: "85610ffef19cc45319ad23df13b1d8aaea394c42d9870aeb6b4dddcc4526be32",
});

await importToStore(recipe);
export const binutilsSourceRecipe = recipe;
