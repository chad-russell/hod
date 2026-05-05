//! musl-toolchain unpack recipe.
import { unpack, importToStore } from "../../js/src/index.js";
const recipe = await unpack({
  archive_hash: "a77bdfcf09a27aacf21aba8cd4282e7adefc83f91769e0742864b77d0dd46fb2",
  format: "tar_gz",
});

await importToStore(recipe);
export const muslToolchainRecipe = recipe;
