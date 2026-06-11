import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://ziglang.org/download/0.15.2/zig-x86_64-linux-0.15.2.tar.xz",
  hash: "c137e52a362c093079c75ce5aed422cf6e080d8cb167790436d791e2ceea4091",
});

export const zigSourceRecipe = recipe;
