import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { cProfile } from "../../helpers/c.js";
import { zshSyntaxHighlightingSourceRecipe } from "./zsh-syntax-highlighting-source.js";

const recipe = await shellBuild({
  ...cProfile(),
  sourceDir: true,
  script: `
mkdir -p "$OUT/share/zsh-syntax-highlighting"
cp -a . "$OUT/share/zsh-syntax-highlighting/"
`,
  deps: [
    dep("source", zshSyntaxHighlightingSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
  ],
});

await importToStore(recipe);
export const zshSyntaxHighlightingRecipe = recipe;
