//! binutils source download.
//!
//! Downloads GNU binutils 2.37 (matching the version in the musl.cc seed
//! toolchain) from ftp.gnu.org. This is the source tarball used to build
//! musl-targeting binutils in binutils-musl.ts.
import { download, importToStore } from "../../js/src/index.js";

const recipe = await download({
  url: "https://ftp.gnu.org/gnu/binutils/binutils-2.37.tar.xz",
  hash: "faa3e5fdcb75cd78c6da026b28f0f144af4346feefad0ddd6cbdd2045389c676",
});

await importToStore(recipe);
export const binutilsSourceRecipe = recipe;
