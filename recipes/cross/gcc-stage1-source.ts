//! gcc-stage1 source download.
import { download, importToStore } from "../../js/src/index.js";
const recipe = await download({
  url: "https://mirrors.kernel.org/gnu/gcc/gcc-13.2.0/gcc-13.2.0.tar.xz",
  hash: "875af4d704560973ada577955392735ded87e6fd304bd0cbaf8ac795390501c7",
});

await importToStore(recipe);
export const gccStage1SourceRecipe = recipe;
