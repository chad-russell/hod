//! musl-toolchain source download.
import { download, importToStore } from "../../js/src/index.js";
const recipe = await download({
  url: "https://musl.cc/x86_64-linux-musl-native.tgz",
  hash: "a77bdfcf09a27aacf21aba8cd4282e7adefc83f91769e0742864b77d0dd46fb2",
});

await importToStore(recipe);
export const muslToolchainSourceRecipe = recipe;
