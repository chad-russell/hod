//! python source download.
import { download, importToStore } from "../../js/src/index.js";
const recipe = await download({
  url: "https://github.com/astral-sh/python-build-standalone/releases/download/20260414/cpython-3.12.13%2B20260414-x86_64-unknown-linux-musl-install_only_stripped.tar.gz",
  hash: "a2dd7179717e105867adb832e7fe78f4ec54cfc4b35ea5c0aa000ec37f9fd135",
});

await importToStore(recipe);
export const pythonSourceRecipe = recipe;
