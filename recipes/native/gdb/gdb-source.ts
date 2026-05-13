//! GDB source download.
//!
//! GNU Debugger 17.2.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://ftp.gnu.org/gnu/gdb/gdb-17.2.tar.xz",
  hash: "07f378d1b532add0fde23f2c82f95a34f569f83ce5f3f71bd51b4ecaeb4a7db2",
});

export const gdbSourceRecipe = recipe;
