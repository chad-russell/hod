//! gcc source download.
//!
//! Downloads GCC 14.2.0 source from ftp.gnu.org. This is a modern compiler
//! that satisfies glibc 2.41's minimum requirement of GCC >= 11.5.
//! Building from source produces a musl-targeting gcc that can replace the
//! pre-built musl.cc toolchain.
import { download, importToStore } from "../../js/src/index.js";

const recipe = await download({
  url: "https://ftp.gnu.org/gnu/gcc/gcc-14.2.0/gcc-14.2.0.tar.xz",
  hash: "ffee29313fd417420454d985b6740be3755e6465e14173c420c02e3719a51539",
});

await importToStore(recipe);
export const gccSourceRecipe = recipe;
